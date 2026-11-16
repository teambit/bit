#!/usr/bin/env python3
"""Compare Node and Rust `log --remote` against the same local HTTP scope.

Example: remote-log-parity.py --source /path/to/workspace --entry /path/to/bin/bit.js \
  --node /path/to/source-node-wrapper --rust /path/to/native/bit
"""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading


ROWS = [
    {"message": "first\nsecond", "username": None, "email": "a@example.com",
     "date": "1800000000000", "hash": "a" * 40, "tag": None},
    {"message": "later", "username": "Alice", "email": None,
     "date": "1800000001000", "hash": "b" * 40, "tag": "1.0.0"},
]
VARIANTS = [(), ("--json",), ("--one-line",), ("--one-line", "--json"),
            ("--full-hash", "--full-message"), ("--show-hidden",)]
FILE_VARIANTS = [*VARIANTS, ("--parents",), ("--parents", "--json")]


class Scope(BaseHTTPRequestHandler):
    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["content-length"])))
        if self.path != "/graphql" or request.get("variables") != {"id": "acme.ui/button"}:
            self.send_error(400)
            return
        body = json.dumps({"data": {"scope": {"getLogs": ROWS}}}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--entry", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--rust", type=Path, required=True)
    parser.add_argument("--file-id", help="component id in --source for file:// remote parity")
    args = parser.parse_args()
    if not (args.source / ".bitmap").is_file():
        parser.error("--source must be a Bit workspace")
    server = ThreadingHTTPServer(("127.0.0.1", 0), Scope)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix="bit-remote-log-parity-") as directory:
            stage = Path(directory)
            workspace = stage / "workspace"
            shutil.copytree(args.source, workspace, symlinks=True)
            config = stage / "globals" / "config"
            config.mkdir(parents=True)
            remotes = {"acme.ui": f"http://127.0.0.1:{server.server_port}"}
            cases = [("acme.ui/button", VARIANTS)]
            if args.file_id:
                scope_name = args.file_id.split("/", 1)[0]
                scope = stage / "file-scope"
                shutil.copytree(args.source / ".bit", scope, symlinks=True)
                stored_name = json.loads((scope / "scope.json").read_text())["name"]
                if stored_name != scope_name:
                    parser.error("--file-id scope does not match --source")
                remotes[scope_name] = scope.as_uri()
                cases.append((args.file_id, FILE_VARIANTS))
            (config / "global-remotes.json").write_text(json.dumps(remotes))
            environment = os.environ.copy()
            environment.update({"CI": "1", "BIT_DISABLE_SPINNER": "true",
                                "BIT_GLOBALS_DIR": str(stage / "globals"),
                                "BIT_NODE_CLI": str(args.entry.resolve())})
            for cwd in (stage, workspace):
                for component_id, variants in cases:
                    for flags in variants:
                        outputs = []
                        for binary in (args.node, args.rust):
                            result = subprocess.run(
                                [str(binary.resolve()), "log", component_id, "--remote", *flags],
                                cwd=cwd, env={**environment, "BIT_NATIVE_TRACE": "1"},
                                capture_output=True, text=True, timeout=45, check=False,
                            )
                            outputs.append(result)
                        node, rust = outputs
                        if (node.returncode, node.stdout) != (rust.returncode, rust.stdout):
                            raise AssertionError(f"{cwd.name} {component_id} {flags}: Node {node.stdout!r}; Rust {rust.stdout!r}")
                        if "running `log` natively" not in rust.stderr or "declined" in rust.stderr:
                            raise AssertionError(f"{cwd.name} {component_id} {flags}: native route missing: {rust.stderr}")
                        print(f"{cwd.name} {component_id} {' '.join(flags) or 'default'}: equal")
    finally:
        server.shutdown()
        thread.join()
        server.server_close()


if __name__ == "__main__":
    main()
