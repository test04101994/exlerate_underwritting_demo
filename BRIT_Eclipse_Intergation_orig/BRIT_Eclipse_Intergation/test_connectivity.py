#!/usr/bin/env python3
"""
Simple connectivity tester.

Performs a single HTTPS ``GET`` against the configured health endpoint
using the per-environment PFX client certificate, to verify that the
mutual-TLS handshake succeeds before attempting any real SOAP traffic.

Usage:
    python test_connectivity.py            # defaults to dev
    python test_connectivity.py dev
    python test_connectivity.py uat
    python test_connectivity.py prod

Exit codes:
    0  endpoint returned 2xx
    1  any failure (bad args, PFX load, network, non-2xx response)
"""

import json
import logging
import os
import sys
import tempfile

import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import NoEncryption, pkcs12


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("connectivity")


def pfx_to_pem(pfx_path, password):
    """Convert a PKCS#12 (.pfx) bundle into separate PEM cert and key files.

    Args:
        pfx_path: Filesystem path to the .pfx file.
        password: Password used to decrypt the PFX bundle.

    Returns:
        Tuple ``(cert_pem_path, key_pem_path)``. The caller is responsible
        for deleting both files when finished (see ``main``).
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
    return cf.name, kf.name


def main():
    """Entry point: parse the env argument and run the connectivity probe.

    Defaults to ``dev`` when no argument is supplied. Exits with code 1
    on any failure, code 0 only if the endpoint returns a 2xx response.
    """
    if len(sys.argv) == 1:
        env = "dev"
        log.info("No environment supplied — defaulting to 'dev'")
    elif len(sys.argv) == 2 and sys.argv[1] in ("dev", "uat", "prod"):
        env = sys.argv[1]
    else:
        log.error("Usage: python test_connectivity.py [dev|uat|prod]  (default: dev)")
        sys.exit(1)

    here = os.path.dirname(os.path.abspath(__file__))

    with open(os.path.join(here, "config.json")) as f:
        cfg = json.load(f)[env]

    pfx_path = os.path.join(here, cfg["pfx"])
    endpoint = cfg["endpoint"]
    password = cfg["password"]

    log.info("Environment : %s", env)
    log.info("Endpoint    : %s", endpoint)
    log.info("PFX         : %s", pfx_path)

    cert, key = pfx_to_pem(pfx_path, password)
    try:
        r = requests.get(endpoint, cert=(cert, key), timeout=15)
        log.info("Status  : %s %s", r.status_code, r.reason)
        log.info("Time    : %.0f ms", r.elapsed.total_seconds() * 1000)
        log.info("Body    : %s", r.text[:300])
        if r.ok:
            log.info("SUCCESS")
            sys.exit(0)
        else:
            log.error("FAILED")
            sys.exit(1)
    except Exception as e:
        log.exception("ERROR: %s", e)
        sys.exit(1)
    finally:
        os.remove(cert)
        os.remove(key)


if __name__ == "__main__":
    main()
