#!/usr/bin/env python3
"""Run all seven disposable transfer workloads with exact parity verification."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures', type=Path, required=True)
    parser.add_argument('--node', type=Path, required=True, help='published CLI wrapper')
    parser.add_argument('--rust', type=Path, required=True)
    parser.add_argument('--node-binary', type=Path, required=True)
    parser.add_argument('--node-cli', type=Path, required=True)
    parser.add_argument('--runs', type=int, default=5)
    args = parser.parse_args()
    if args.runs < 1:
        parser.error('--runs must be positive')
    fixtures = json.loads(args.fixtures.read_text())
    root = Path(fixtures['root'])
    remote = Path(fixtures['remote'])
    environment = os.environ.copy()
    environment.update(fixtures['environment'])
    environment.update(BIT_NODE_BINARY=str(args.node_binary.resolve()),
                       BIT_NODE_CLI=str(args.node_cli.resolve()))
    environment['PATH'] = str(args.node_binary.resolve().parent) + os.pathsep + environment['PATH']
    repository = Path(__file__).resolve().parents[2]
    results = []
    with tempfile.TemporaryDirectory(prefix='bit-transfer-suite-') as temporary:
        stage = Path(temporary)
        backup = stage / 'original-remote'
        shutil.copytree(remote, backup, symlinks=True)
        try:
            for workload in fixtures['workloads']:
                name = workload.get('name', workload['source'])
                print(f'Measuring {name}', file=sys.stderr, flush=True)
                shutil.rmtree(remote)
                shutil.copytree(root / workload['remote_baseline'], remote, symlinks=True)
                case_environment = environment.copy()
                server = None
                with (stage / f'{name}-server.stderr').open('w') as server_errors:
                    try:
                        if name == 'export-hub':
                            server = subprocess.Popen([
                                str(args.node_binary.resolve()),
                                str(repository / 'native/cli/tests/e2e/harmony/export_hub/server.cjs'),
                                str(args.node_cli.resolve()), str(root / 'hub.json'),
                                str(stage / 'hub-requests.jsonl')], env=environment,
                                stdout=subprocess.PIPE, stderr=server_errors, text=True)
                            port = server.stdout.readline().strip()
                            if not port.isdigit():
                                raise RuntimeError('hub server failed: ' +
                                                   (stage / f'{name}-server.stderr').read_text())
                            case_environment.update(BIT_CONFIG_SYMPHONY_URL=f'http://127.0.0.1:{port}',
                                                    BIT_CONFIG_USER_TOKEN='fixture-token',
                                                    __CUSTOM_ORIGIN='fixture-hub')
                        command = [sys.executable, str(repository / 'scripts/rust/bench-transfer.py'),
                                   '--source', str(root / workload['source']), '--remote', str(remote),
                                   '--node', str(args.node.resolve()), '--rust', str(args.rust.resolve()),
                                   '--runs', str(args.runs), '--', *workload['command']]
                        output = subprocess.run(command, env=case_environment, cwd=repository,
                                                capture_output=True, text=True)
                        if output.returncode:
                            raise RuntimeError(f'{name}: {output.stderr}\n{output.stdout}')
                        report = json.loads(output.stdout)
                        report['workload'] = name
                        results.append(report)
                        print(f"{name}: {report['median_ms']}", file=sys.stderr, flush=True)
                    finally:
                        if server is not None:
                            server.terminate()
                            try:
                                server.wait(timeout=10)
                            except subprocess.TimeoutExpired:
                                server.kill()
                                server.wait()
        finally:
            shutil.rmtree(remote)
            shutil.copytree(backup, remote, symlinks=True)
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
