#!/usr/bin/env python3
"""Compare complete `bit status --json` commands with BIT_FEATURES=no-fs-cache.

Each measurement uses a fresh workspace copy with its dependency cache removed.
The fixture must be a valid Bit workspace supported by the native status path.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import statistics
import subprocess
import tempfile
import time


def fingerprint(root):
    digest = hashlib.sha256()
    for path in sorted(root.rglob('*')):
        if not path.is_file() or 'node_modules' in path.parts or 'cache' in path.parts:
            continue
        digest.update(str(path.relative_to(root)).encode())
        digest.update(b'\0')
        digest.update(path.read_bytes())
        digest.update(b'\0')
    return digest.hexdigest()


def run(command, workspace, env):
    started = time.perf_counter()
    completed = subprocess.run(command + ['status', '--json'], cwd=workspace,
                               env=env, capture_output=True, text=True, check=True)
    elapsed = (time.perf_counter() - started) * 1000
    return round(elapsed, 3), json.loads(completed.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--native', type=Path, required=True)
    parser.add_argument('--node-entry', type=Path, required=True)
    parser.add_argument('--node-binary', type=Path, required=True)
    parser.add_argument('--globals', type=Path, required=True)
    parser.add_argument('--home', type=Path, required=True)
    parser.add_argument('--samples', type=int, default=5)
    args = parser.parse_args()
    if args.samples < 1:
        parser.error('--samples must be positive')
    env = os.environ.copy()
    env.update({
        'BIT_FEATURES': 'no-fs-cache',
        'BIT_GLOBALS_DIR': str(args.globals.resolve()),
        'BIT_NODE_CLI': str(args.node_entry.resolve()),
        'BIT_NODE_BINARY': str(args.node_binary.resolve()),
        'HOME': str(args.home.resolve()),
        'USERPROFILE': str(args.home.resolve()),
        'CI': '1',
    })
    env.pop('BIT_NATIVE', None)
    measurements = {'rust': [], 'node': []}
    with tempfile.TemporaryDirectory(prefix='bit-no-fs-cache-bench-') as temp:
        for index in range(args.samples):
            results = {}
            for name, command in (
                ('rust', [str(args.native.resolve())]),
                ('node', [str(args.node_binary.resolve()), str(args.node_entry.resolve())]),
            ):
                workspace = Path(temp) / f'{index}-{name}'
                shutil.copytree(args.fixture, workspace, symlinks=True)
                shutil.rmtree(workspace / '.bit/cache/components/deps', ignore_errors=True)
                elapsed, results[name] = run(command, workspace, env)
                measurements[name].append(elapsed)
            if results['rust'] != results['node']:
                raise RuntimeError(f'full JSON mismatch in sample {index}')
    print(json.dumps({
        'source_sha256': fingerprint(args.fixture),
        'helper_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'samples_ms': measurements,
        'median_ms': {name: statistics.median(values) for name, values in measurements.items()},
        'full_json_equal': True,
    }, indent=2))


if __name__ == '__main__':
    main()
