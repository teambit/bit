#!/usr/bin/env python3
"""Exercise Windows-sensitive lane imports with a 1 MiB main stack on Linux."""
import json
from pathlib import Path
import resource
import subprocess

NATIVE = Path(__file__).resolve().parents[2] / 'native'
TESTS = [
    'commands::export::hidden_lane_update_dependent_exports_like_node',
    'harmony::merge_policy::hidden_lane_merge_preserves_scope_configuration_without_workspace_files',
    'harmony::merge_policy::hidden_pending::hidden_fast_forward_and_visible_merge_share_the_retained_snapshot_owner',
]


def limit_stack():
    _, hard = resource.getrlimit(resource.RLIMIT_STACK)
    resource.setrlimit(resource.RLIMIT_STACK, (1024 * 1024, hard))


def main():
    result = subprocess.run([
        'cargo', 'test', '--locked', '-p', 'bit-cli', '--features', 'e2e',
        '--test', 'e2e', '--no-run', '--message-format=json',
    ], cwd=NATIVE, text=True, stdout=subprocess.PIPE, check=True)
    artifacts = [json.loads(line) for line in result.stdout.splitlines()]
    binaries = [row['executable'] for row in artifacts
                if row.get('reason') == 'compiler-artifact'
                and row.get('target', {}).get('name') == 'e2e'
                and row.get('executable')]
    if len(binaries) != 1:
        raise RuntimeError(f'expected one e2e executable, found {len(binaries)}')
    listed = subprocess.check_output([binaries[0], '--list'], cwd=NATIVE, text=True)
    available = {line.removesuffix(': test') for line in listed.splitlines()}
    if missing := set(TESTS) - available:
        raise RuntimeError(f'missing stack regression tests: {sorted(missing)}')
    for name in TESTS:
        subprocess.run([binaries[0], name, '--exact', '--nocapture'],
                       cwd=NATIVE, preexec_fn=limit_stack, check=True)


if __name__ == '__main__':
    main()
