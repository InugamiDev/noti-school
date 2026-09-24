"""Offline executable/wire-schema check; requires Python jsonschema and cargo build.

Only starts this checkout's binary, with an empty service environment. No database,
identity, mail, or AI provider is contacted. Refuses an occupied loopback port.
"""
import json
import pathlib
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.request

import jsonschema

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCHEMA = json.loads((ROOT / "packages/contracts/schema.json").read_text())
with socket.socket() as probe:
    probe.bind(("127.0.0.1", 3810))

process = subprocess.Popen(
    [str(ROOT / "target/debug/noti-school-api")],
    cwd=ROOT,
    env={},
    stdout=subprocess.DEVNULL,
    stderr=subprocess.PIPE,
)
try:
    for _ in range(100):
        if process.poll() is not None:
            raise AssertionError("API exited during disabled boot")
        try:
            with socket.create_connection(("127.0.0.1", 3810), timeout=0.05):
                break
        except OSError:
            time.sleep(0.02)
    else:
        raise AssertionError("API did not bind")

    cases = [
        ("/healthz", 200, "Health"),
        ("/readyz", 503, "Health"),
        ("/api/v1/capabilities", 200, "Capabilities"),
        ("/api/v1/institutions", 200, "InstitutionPage"),
        ("/api/v1/me", 503, "ApiError"),
        ("/api/no-such-route", 404, "ApiError"),
        ("/internal/session", 404, "ApiError"),
        ("/internal/invitations/check", 404, "ApiError"),
    ]
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for path, status, name in cases:
        request = urllib.request.Request(
            "http://127.0.0.1:3810" + path, headers={"Host": "noti.school"}
        )
        try:
            response = opener.open(request, timeout=2)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            assert response.status == status, (path, response.status)
            value = json.load(response)
            jsonschema.Draft202012Validator(
                {**SCHEMA, "$ref": "#/$defs/" + name},
                format_checker=jsonschema.FormatChecker(),
            ).validate(value)
        print(f"PASS {path}: {status} {name}")
finally:
    process.send_signal(signal.SIGTERM)
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
        raise AssertionError("API failed graceful SIGTERM")
assert process.returncode == 0
print("PASS disabled executable boot, frozen JSON schemas, and graceful SIGTERM")
