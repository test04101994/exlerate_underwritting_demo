#!/usr/bin/env python3
"""
Eclipse SOAP client.

Loads the per-environment WSDL over mutual TLS using a PFX-format client
certificate, and exposes a configured ``zeep.Client`` for invoking SOAP
operations.

Usage:
    python eclipse_client.py            # defaults to dev
    python eclipse_client.py dev
    python eclipse_client.py uat
    python eclipse_client.py prod

Environment variables:
    ECLIPSE_INSECURE=1  Process-wide TLS verification kill-switch. Disables
                        cert checks for the requests session AND for lxml's
                        libxml2-driven WSDL/XSD imports. Debug-only — never
                        ship with this set.

Exit codes:
    0  success
    1  invalid command-line arguments
    2  PFX load failed (bad path, wrong password, corrupt file)
    3  WSDL load failed (network, mTLS handshake, parse error)
"""

import atexit
import json
import logging
import os
import ssl
import sys
import tempfile

# Debug-only: when ECLIPSE_INSECURE=1 is set, disable TLS verification for
# every Python TLS client in this process — including libxml2 used by lxml
# (and therefore zeep) when it resolves XSD imports outside our requests
# session. This is a much bigger hammer than ``session.verify = False`` and
# must NEVER be used outside local debugging. Patch must run before any
# library captures the default SSL context, so it sits above all other
# imports below.
if os.environ.get("ECLIPSE_INSECURE") == "1":
    ssl._create_default_https_context = ssl._create_unverified_context

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import NoEncryption, pkcs12
from requests import Session
from requests.adapters import HTTPAdapter
from zeep import Client
from zeep.transports import Transport


class InsecureAdapter(HTTPAdapter):
    """HTTPS adapter that forces an unverified TLS context.

    Used as a hard override when ``verify_tls`` is false — bypasses any
    ``REQUESTS_CA_BUNDLE`` / ``CURL_CA_BUNDLE`` / ``SSL_CERT_FILE`` env vars
    that ``requests`` would otherwise honour and which would silently
    override ``session.verify = False``.
    """

    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl._create_unverified_context()
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, *args, **kwargs):
        ctx = ssl._create_unverified_context()
        kwargs["ssl_context"] = ctx
        return super().proxy_manager_for(*args, **kwargs)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("eclipse")


def pfx_to_pem(pfx_path, password):
    """Convert a PKCS#12 (.pfx) bundle into separate PEM cert and key files.

    The PEM files are written to the OS temp directory and registered for
    deletion at interpreter exit via ``atexit``.

    Args:
        pfx_path: Filesystem path to the .pfx file.
        password: Password used to decrypt the PFX bundle.

    Returns:
        Tuple ``(cert_pem_path, key_pem_path)`` suitable for
        ``requests.Session.cert``.
    """
    with open(pfx_path, "rb") as f:
        key, cert, extra = pkcs12.load_key_and_certificates(f.read(), password.encode())

    cert_pem = cert.public_bytes(serialization.Encoding.PEM)
    for c in extra or []:
        cert_pem += c.public_bytes(serialization.Encoding.PEM)

    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        NoEncryption(),
    )

    cf = tempfile.NamedTemporaryFile(delete=False, suffix=".pem")
    kf = tempfile.NamedTemporaryFile(delete=False, suffix=".pem")
    cf.write(cert_pem); cf.close()
    kf.write(key_pem); kf.close()
    atexit.register(lambda: os.path.exists(cf.name) and os.remove(cf.name))
    atexit.register(lambda: os.path.exists(kf.name) and os.remove(kf.name))
    return cf.name, kf.name


def load_config(env):
    """Read ``config.json`` and return the section for the given environment.

    The ``pfx`` value is rewritten to an absolute path so the caller does
    not need to know the script's working directory.

    Args:
        env: One of ``"dev"``, ``"uat"``, ``"prod"``.

    Returns:
        Dict with keys ``endpoint``, ``wsdl``, ``pfx``, ``password``.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "config.json")) as f:
        cfg = json.load(f)[env]
    cfg["pfx"] = os.path.join(here, cfg["pfx"])
    if cfg.get("ca_bundle"):
        cfg["ca_bundle"] = os.path.join(here, cfg["ca_bundle"])
    return cfg


def resolve_verify(cfg):
    """Translate the config's TLS-verification fields into a ``requests`` value.

    Returns one of:
        * ``False`` if ``verify_tls`` is explicitly false (verification off).
        * A path string if ``ca_bundle`` is set (verify against that bundle).
        * ``True`` otherwise (verify against the system trust store).

    When verification is disabled, urllib3's ``InsecureRequestWarning`` is
    suppressed and a ``WARNING`` log line is emitted so the operator notices.
    """
    if cfg.get("verify_tls") is False:
        from urllib3 import disable_warnings
        from urllib3.exceptions import InsecureRequestWarning
        disable_warnings(InsecureRequestWarning)
        log.warning("TLS verification DISABLED — connection is not authenticated. Use only for debugging.")
        return False
    if cfg.get("ca_bundle"):
        return cfg["ca_bundle"]
    return True


def build_client(env):
    """Construct a ``zeep.Client`` configured with mTLS for ``env``.

    Validates the PFX up front (exits with code 2 on failure), then fetches
    and parses the WSDL over the same mTLS-bound session (exits with code 3
    on failure). On success returns a ready-to-use SOAP client.

    Args:
        env: One of ``"dev"``, ``"uat"``, ``"prod"``.

    Returns:
        A ``zeep.Client`` whose transport carries the client certificate.
    """
    cfg = load_config(env)

    try:
        cert, key = pfx_to_pem(cfg["pfx"], cfg["password"])
    except Exception as e:
        log.exception("PFX load failed (bad path, password, or corrupted file): %s", e)
        sys.exit(2)
    log.info("PFX loaded successfully")

    session = Session()
    session.cert = (cert, key)
    session.verify = resolve_verify(cfg)

    if session.verify is False:
        # Two layers of defence so a corporate REQUESTS_CA_BUNDLE / CURL_CA_BUNDLE
        # / SSL_CERT_FILE env var cannot silently re-enable verification:
        # 1. trust_env=False stops requests from reading those env vars at all.
        # 2. InsecureAdapter forces an unverified SSL context inside urllib3,
        #    which is the layer that actually performs the handshake.
        session.trust_env = False
        session.mount("https://", InsecureAdapter())

    # timeout      = WSDL/XSD fetch read timeout (cold-start WCF can be slow).
    # operation_timeout = SOAP-call read timeout once the client is built.
    transport = Transport(session=session, timeout=60, operation_timeout=60)

    try:
        client = Client(cfg["wsdl"], transport=transport)
    except Exception as e:
        log.exception("WSDL load failed (network, TLS, or WSDL parse error): %s", e)
        sys.exit(3)
    log.info("WSDL loaded successfully")

    return client


def list_operations(client):
    """Log every SOAP operation the WSDL exposes, with its argument signature.

    Useful as a connectivity-confirmation step: if this prints operations,
    the WSDL was fetched, parsed, and the binding is intact end-to-end.

    Args:
        client: A constructed ``zeep.Client``.
    """
    count = 0
    for service in client.wsdl.services.values():
        log.info("Service: %s", service.name)
        for port in service.ports.values():
            log.info("  Port: %s @ %s", port.name, port.binding_options.get("address", "?"))
            for op in port.binding._operations.values():
                try:
                    sig = op.input.signature() if op.input else ""
                except Exception:
                    sig = "<signature unavailable>"
                log.info("    Operation: %s(%s)", op.name, sig)
                count += 1
    log.info("Total operations exposed: %d", count)


def main():
    """Entry point: parse the env argument and build the client.

    Defaults to ``dev`` when no argument is supplied. Exits with code 1
    if an unrecognised environment is passed.
    """
    if len(sys.argv) == 1:
        env = "dev"
        log.info("No environment supplied — defaulting to 'dev'")
    elif len(sys.argv) == 2 and sys.argv[1] in ("dev", "uat", "prod"):
        env = sys.argv[1]
    else:
        log.error("Usage: python eclipse_client.py [dev|uat|prod]  (default: dev)")
        sys.exit(1)

    if os.environ.get("ECLIPSE_INSECURE") == "1":
        log.warning("ECLIPSE_INSECURE=1 — process-wide TLS verification disabled (debug only).")

    cfg = load_config(env)

    log.info("Environment : %s", env)
    log.info("WSDL        : %s", cfg["wsdl"])
    log.info("PFX         : %s", cfg["pfx"])

    client = build_client(env)
    log.info("Service     : %s", client.service)

    list_operations(client)

    # Replace with the real operation and arguments once known.
    # result = client.service.SomeOperation(arg1="...", arg2="...")
    # log.info("Result: %s", result)


if __name__ == "__main__":
    main()
