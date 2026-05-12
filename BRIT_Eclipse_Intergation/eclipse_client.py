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

try:
    import xmlsec
    from zeep.wsse.signature import BinarySignature
    _HAS_XMLSEC = True
except ImportError as _xmlsec_err:
    xmlsec = None
    BinarySignature = None
    _HAS_XMLSEC = False
    _XMLSEC_IMPORT_ERROR = _xmlsec_err


if _HAS_XMLSEC:
    from datetime import datetime, timedelta, timezone
    from lxml import etree
    from zeep import ns as _zeep_ns
    from zeep.wsse import utils as _wsse_utils

    class WcfSignature(BinarySignature):
        """WSSE signature tuned for WCF interop.

        Differences vs. zeep's defaults:
          * Uses RSA-SHA256 / SHA-256 instead of the deprecated RSA-SHA1.
            Modern WCF services reject SHA-1 signatures by default.
          * Inherits from ``BinarySignature`` so the X.509 cert ships as a
            ``BinarySecurityToken`` referenced by ``SecurityTokenReference``
            (the WCF-standard placement) rather than embedded in ``KeyInfo``.
          * Injects a ``wsu:Timestamp`` into the WSSE Security header before
            signing. WCF's default security policy requires the message to
            carry a Timestamp and for that Timestamp to be one of the signed
            references. Zeep's internal ``_sign_envelope_with_key`` discovers
            the Timestamp at sign time and automatically adds it to the
            signed elements alongside the Body.
          * Overrides ``verify`` to a no-op: BRIT signs the request but does
            not sign the response, and zeep's default ``verify`` crashes
            with ``'NoneType' has no attribute 'find'`` on unsigned replies.
        """

        TIMESTAMP_TTL_SECONDS = 300  # 5-minute validity window

        def __init__(self, key_file, certfile, password=None):
            super().__init__(
                key_file=key_file,
                certfile=certfile,
                password=password,
                signature_method=xmlsec.Transform.RSA_SHA256,
                digest_method=xmlsec.Transform.SHA256,
            )

        def apply(self, envelope, headers):
            self._inject_timestamp(envelope)
            return super().apply(envelope, headers)

        def _inject_timestamp(self, envelope):
            security = _wsse_utils.get_security_header(envelope)
            wsu_q = lambda name: etree.QName(_zeep_ns.WSU, name)

            # Replace any existing Timestamp so consecutive calls don't pile up.
            for existing in security.findall(wsu_q("Timestamp")):
                security.remove(existing)

            now = datetime.now(timezone.utc).replace(microsecond=0)
            expires_at = now + timedelta(seconds=self.TIMESTAMP_TTL_SECONDS)
            fmt = "%Y-%m-%dT%H:%M:%SZ"

            timestamp = etree.SubElement(security, wsu_q("Timestamp"))
            _wsse_utils.ensure_id(timestamp)
            etree.SubElement(timestamp, wsu_q("Created")).text = now.strftime(fmt)
            etree.SubElement(timestamp, wsu_q("Expires")).text = expires_at.strftime(fmt)

        def verify(self, envelope):
            return envelope
else:
    WcfSignature = None


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

    # WS-Security message signing. BRIT's WCF service rejects unsigned
    # SOAP bodies with "An error occurred when verifying security for the
    # message." We sign every outbound message with the same PFX-derived
    # cert/key pair already used for mTLS.
    wsse = None
    if cfg.get("wsse_signature"):
        if not _HAS_XMLSEC:
            log.error(
                "wsse_signature=true in config but xmlsec is not importable: %s. "
                "Install with: pip install xmlsec lxml  "
                "(on macOS first: brew install libxml2 libxmlsec1)",
                _XMLSEC_IMPORT_ERROR,
            )
            sys.exit(4)
        wsse = WcfSignature(key_file=key, certfile=cert)
        log.info("WS-Security signature enabled (BinarySecurityToken, RSA-SHA256, sign outgoing only)")

    try:
        client = Client(cfg["wsdl"], transport=transport, wsse=wsse)
    except Exception as e:
        log.exception("WSDL load failed (network, TLS, or WSDL parse error): %s", e)
        sys.exit(3)
    log.info("WSDL loaded successfully")

    return client


def dump_wsdl_policies(env):
    """Fetch the WSDL (plus any imports it references) and log every
    WS-Policy assertion found.

    WCF splits a service's WSDL across several documents — the root URL
    (``?wsdl``) typically contains only services/bindings, and policy
    assertions live in imported documents (``?wsdl=wsdl0``,
    ``?wsdl=wsdl1``, etc.). This helper recursively follows
    ``wsdl:import`` and ``xsd:import`` references so policies in any
    imported file are surfaced.

    For diagnostics it also prints, per document:
      * URL fetched and response size
      * Every distinct namespace declared in the document
      * Every element whose local name contains "Policy" (catches both
        ``wsp:Policy`` and ``wsp:PolicyReference``)
    """
    from lxml import etree
    from urllib.parse import urljoin

    cfg = load_config(env)
    cert, key = pfx_to_pem(cfg["pfx"], cfg["password"])

    session = Session()
    session.cert = (cert, key)
    session.verify = resolve_verify(cfg)
    if session.verify is False:
        session.trust_env = False
        session.mount("https://", InsecureAdapter())

    visited = set()
    queue = [cfg["wsdl"]]
    total_policies = 0

    while queue:
        url = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)

        log.info("==== Fetching %s ====", url)
        try:
            r = session.get(url, timeout=60)
            r.raise_for_status()
        except Exception as e:
            log.warning("Failed to fetch %s: %s", url, e)
            continue
        log.info("  Response size: %d bytes", len(r.content))

        try:
            root = etree.fromstring(r.content)
        except Exception as e:
            log.warning("  Could not parse XML: %s", e)
            continue

        # Distinct namespaces actually present in this document.
        ns_used = set()
        for el in root.iter():
            if isinstance(el.tag, str) and el.tag.startswith("{"):
                ns_used.add(el.tag.split("}", 1)[0][1:])
        log.info("  Namespaces in document: %s", sorted(ns_used))

        # Anything Policy-shaped, regardless of namespace.
        policy_like = [
            el for el in root.iter()
            if isinstance(el.tag, str) and "Policy" in el.tag.split("}", 1)[-1]
        ]
        for el in policy_like:
            local = el.tag.split("}", 1)[-1]
            log.info("  --- Found <%s> ---", local)
            log.info("%s", etree.tostring(el, pretty_print=True).decode())
            total_policies += 1

        # Queue up any imports so we descend into them.
        for imp_tag in (
            "{http://schemas.xmlsoap.org/wsdl/}import",
            "{http://www.w3.org/2001/XMLSchema}import",
            "{http://www.w3.org/2001/XMLSchema}include",
        ):
            for imp in root.iter(imp_tag):
                loc = imp.get("location") or imp.get("schemaLocation")
                if loc:
                    queue.append(urljoin(url, loc))

    if total_policies == 0:
        log.warning(
            "No <Policy> / <PolicyReference> elements found across %d "
            "document(s). The service may publish policy via MEX "
            "(Metadata Exchange) at <serviceurl>/mex instead of inline "
            "WSDL — ask BRIT for the security policy spec.",
            len(visited),
        )
    else:
        log.info("Total Policy-shaped elements found: %d across %d documents", total_policies, len(visited))


def inspect_required_fields(client, type_name):
    """Log each field of a complex type with its required/optional status.

    Reads ``minOccurs`` and ``nillable`` from the underlying XSD via zeep's
    type introspection. Convention:

    * ``minOccurs >= 1`` and ``nillable=false`` -> **REQUIRED** (server will reject if missing).
    * ``minOccurs = 0`` -> optional (can omit the field entirely).
    * ``nillable=true`` -> may be present but explicitly null.

    Args:
        client: A constructed ``zeep.Client``.
        type_name: Type name, e.g. ``"ns4:SecurityToken"``.
    """
    try:
        t = client.get_type(type_name)
    except Exception as e:
        log.warning("Type %s not found: %s", type_name, e)
        return
    log.info("Field requirements for %s:", type_name)
    for name, element in t.elements:
        min_occurs = getattr(element, "min_occurs", "?")
        max_occurs = getattr(element, "max_occurs", "?")
        nillable = getattr(element, "nillable", False)
        is_required = (min_occurs not in (0, "0")) and not nillable
        status = "REQUIRED" if is_required else "optional"
        log.info(
            "  %-20s  %-30s  minOccurs=%s  nillable=%s  -> %s",
            name,
            getattr(element.type, "name", element.type),
            min_occurs,
            nillable,
            status,
        )


def inspect_type(client, type_name):
    """Log the field structure of a complex type defined in the WSDL.

    Helpful when the operation signature mentions a type like
    ``ns4:SecurityToken`` and you need to know what fields to populate
    without external documentation.

    Args:
        client: A constructed ``zeep.Client``.
        type_name: Type name to look up, e.g. ``"ns4:SecurityToken"`` or the
            local name ``"SecurityToken"``.
    """
    try:
        t = client.get_type(type_name)
    except Exception as e:
        log.warning("Type %s not found: %s", type_name, e)
        return
    log.info("Type %s -> %s", type_name, t)
    log.info("  Signature: %s", t.signature())


def build_security_token(client, env):
    """Construct the per-env ``SecurityToken`` SOAP object from config.

    The four fields (EclipseUserId, Id, IsExternal, Type) live in
    ``config.json`` under each env's ``security_token`` block so dev/uat/prod
    can carry different integration identities without code changes.

    Args:
        client: A constructed ``zeep.Client`` (used to resolve the type).
        env: One of ``"dev"``, ``"uat"``, ``"prod"``.

    Returns:
        A ``SecurityToken`` instance ready to pass into any SOAP operation.
    """
    cfg = load_config(env)
    token_cfg = cfg.get("security_token") or {}
    SecurityToken = client.get_type("ns4:SecurityToken")
    token = SecurityToken(
        EclipseUserId=token_cfg.get("EclipseUserId", ""),
        Id=token_cfg.get("Id", 0),
        IsExternal=token_cfg.get("IsExternal", True),
        Type=token_cfg.get("Type", "External"),
    )
    if not token_cfg.get("EclipseUserId"):
        log.warning("security_token.EclipseUserId is empty in config — fill it in before real calls.")
    log.info("SecurityToken: EclipseUserId=%r Id=%s IsExternal=%s Type=%r",
             token.EclipseUserId, token.Id, token.IsExternal, token.Type)
    return token


def try_operation(client, operation_name, **kwargs):
    """Invoke a SOAP operation and log either the result or the server error.

    Wraps the call so a SOAP fault doesn't kill the script — instead the
    fault code, fault string, and detail are logged so you can adjust
    arguments and try again.

    Args:
        client: A constructed ``zeep.Client``.
        operation_name: Name of the operation, e.g. ``"GetPolicy"``.
        **kwargs: Arguments passed straight through to the SOAP call.
    """
    op = getattr(client.service, operation_name, None)
    if op is None:
        log.error("Operation %s not found on client.service", operation_name)
        return None
    # Capture the raw SOAP envelope on both sides — invaluable when the
    # parsed response is opaque or when a fault leaves us guessing.
    from zeep.plugins import HistoryPlugin
    history = HistoryPlugin()
    client.plugins = (client.plugins or []) + [history]
    try:
        result = op(**kwargs)
        log.info("%s returned: %s", operation_name, result)
        return result
    except Exception as e:
        log.exception("%s raised: %s", operation_name, e)
        return None
    finally:
        try:
            from lxml import etree
            if history.last_sent:
                log.info("Last SOAP request:\n%s",
                         etree.tostring(history.last_sent["envelope"], pretty_print=True).decode())
            if history.last_received:
                log.info("Last SOAP response:\n%s",
                         etree.tostring(history.last_received["envelope"], pretty_print=True).decode())
        except Exception:
            pass


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

    # Recon: dump the WSDL's WS-Policy assertions so we can see exactly
    # which elements the server requires signed, which algorithms, etc.
    dump_wsdl_policies(env)

    # Recon: print the SecurityToken type structure so we know what
    # fields to fill in (and which are required).
    inspect_type(client, "ns4:SecurityToken")
    inspect_required_fields(client, "ns4:SecurityToken")
    inspect_type(client, "ns1:Policy")
    inspect_required_fields(client, "ns1:Policy")

    # Probe: call GetPolicy with a minimal payload and see what the server
    # says. Outcomes:
    #   - returns data       → mTLS alone is enough; SecurityToken is a no-op.
    #   - "Token required"   → need real auth credentials from BRIT.
    #   - "Policy not found" → auth worked! Just need a real PolicyId.
    #   - anything else      → log tells us what to adjust.
    Policy = client.get_type("ns1:Policy")
    token = build_security_token(client, env)
    try_operation(
        client,
        "GetPolicy",
        Policy=Policy(Id=1),  # arbitrary Id — replace with a real test PolicyId from BRIT
        SecurityToken=token,
    )
    # log.info("Result: %s", result)


if __name__ == "__main__":
    main()
