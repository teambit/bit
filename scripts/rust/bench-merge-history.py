#!/usr/bin/env python3
"""Time and verify merge/history on fresh workspaces and restored isolated file remotes.

The remote argument must name a disposable fixture remote. Every invocation restores
it from a private baseline, outside the measured interval. Newly allocated staged
snap refs, allocation dates/batch IDs and durations are the only normalized data.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import statistics
import subprocess
import sys
import tempfile
import time


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


sys.dont_write_bytecode = True
BENCH = module('benchmark', 'bench-native-command.py')
VERIFY = module('verification', 'verify-native-command.py')


def normalize(text, workspace, source):
    text = VERIFY.normalized(text).replace(str(workspace), 'WORKSPACE')
    original = source / '.bit/staged-snaps'
    old = set(original.read_text().splitlines()) if original.exists() else set()
    staged = workspace / '.bit/staged-snaps'
    refs = staged.read_text().splitlines() if staged.exists() else []
    for index, ref in enumerate(ref for ref in refs if ref not in old):
        text = text.replace(ref, f'ALLOCATED_{index}')
    for marker in ['Succeeded in ', 'Completed successfully in ', 'Failed in ', ' has failed in ']:
        text = re.sub(re.escape(marker) + r'[^\r\n]*', marker + 'DURATION', text)
    return text


def files(workspace, source):
    result = {}
    for path in sorted(workspace.rglob('*')):
        relative = path.relative_to(workspace)
        if {'.bit', '.git', 'node_modules'}.intersection(relative.parts):
            continue
        if path.is_symlink():
            result[str(relative)] = ['symlink', os.readlink(path)]
        elif path.is_file():
            data = path.read_bytes()
            if path.name in {'.bitmap', 'package.json'}:
                data = normalize(data.decode(), workspace, source).encode()
            result[str(relative)] = ['file', hashlib.sha256(data).hexdigest()]
    return result


def inspect(node, workspace, source):
    def run(*args):
        output = subprocess.run([str(node), *args], cwd=workspace,
                                env={**os.environ, 'BIT_NATIVE': 'off'},
                                capture_output=True, text=True, check=True)
        return json.loads(output.stdout)
    value = run('cat-component', 'bar/foo@latest', '--json')
    bitmap = json.loads(re.sub(r'/\*.*?\*/', '', (workspace / '.bitmap').read_text(), flags=re.S))
    reference = bitmap['bar/foo']['version']
    allocated = bool(re.fullmatch('[0-9a-f]{40}', reference)) and not (
        source / '.bit/objects' / reference[:2] / reference[2:]).is_file()
    if allocated:
        for key in ['hash', 'batchId']:
            value.pop(key, None)
        value['log'].pop('date', None)
        for row in value.get('modified', []):
            row.pop('date', None)
    if value.get('flattenedEdgesRef'):
        value['flattenedEdgesRef'] = run('cat-object', value['flattenedEdgesRef'], '-s')
    return json.loads(normalize(json.dumps(value, sort_keys=True), workspace, source))


def controls(workspace, source):
    result = {}
    for name in ['unmerged', 'staged-snaps', 'staged-config', 'merge-conflict', 'last-merged']:
        path = workspace / '.bit' / name
        if path.is_file():
            result[name] = normalize(path.read_text(), workspace, source)
    return result


def execute(args, stage, baseline, run, label, mode):
    workspace = stage / f'{mode}-{run}-{label}'
    shutil.copytree(args.source, workspace, symlinks=True)
    shutil.rmtree(args.remote)
    shutil.copytree(baseline, args.remote, symlinks=True)
    environment = os.environ.copy()
    for key in ['BIT_NATIVE', 'CI', 'FORCE_COLOR', 'NO_COLOR', 'NODE_DISABLE_COLORS']:
        environment.pop(key, None)
    environment.update(BIT_NATIVE_TRACE='1', NODE_NO_WARNINGS='1')
    if mode == 'ci':
        environment['CI'] = '1'
    binary = args.node if label == 'node' else args.rust
    command = [str(binary), *args.command]
    if mode == 'tty':
        environment.update(TERM='dumb', FORCE_COLOR='1')
        command = ['script', '-q', '-e', '-c', shlex.join(command), '/dev/null']
    started = time.perf_counter()
    output = subprocess.run(command, cwd=workspace, env=environment,
                            capture_output=True, check=False)
    elapsed = round((time.perf_counter() - started) * 1000, 3)
    prefix = stage / f'{mode}-{run}-{label}'
    for stream in ['stdout', 'stderr']:
        prefix.with_name(prefix.name + '.' + stream).write_bytes(getattr(output, stream))
    if output.returncode:
        raise RuntimeError(f'{prefix}: exited {output.returncode}')
    trace = output.stdout + output.stderr
    if label == 'rust' and (b'declined' in trace or b'delegating:' in trace
                            or f'running `{args.command[0]}` natively'.encode() not in trace):
        raise RuntimeError(f'{prefix}: command delegated')
    return elapsed, workspace, output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ['source', 'remote', 'node', 'rust']:
        parser.add_argument('--' + key, type=Path, required=True)
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    args.command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if args.runs < 1 or not args.command:
        parser.error('positive runs and a command required')
    for key in ['source', 'remote', 'node', 'rust']:
        setattr(args, key, getattr(args, key).resolve())
    stage = Path(tempfile.mkdtemp(prefix='merge-history-bench-'))
    baseline = stage / 'remote-baseline'
    shutil.copytree(args.remote, baseline, symlinks=True)
    before = BENCH.fingerprint(args.source)
    samples = {'node': [], 'rust': []}
    verified = []
    try:
        for mode in ['timed', 'tty', 'ci']:
            for run in range(args.runs):
                pair = {}
                for label in (['node', 'rust'] if run % 2 == 0 else ['rust', 'node']):
                    elapsed, workspace, output = execute(args, stage, baseline, run, label, mode)
                    if mode == 'timed':
                        samples[label].append(elapsed)
                    pair[label] = {
                        'stdout': normalize(output.stdout.decode(), workspace, args.source),
                        'stderr': normalize(output.stderr.decode(), workspace, args.source),
                        'files': files(workspace, args.source),
                        'version': inspect(args.node, workspace, args.source),
                        'controls': controls(workspace, args.source),
                    }
                for key in pair['node']:
                    if pair['node'][key] != pair['rust'][key]:
                        (stage / 'mismatch.json').write_text(json.dumps(pair, indent=2))
                        raise RuntimeError(f'{mode} run {run}: {key} differs: {stage}')
                verified.append({'mode': mode, 'run': run, 'workspace_files': len(pair['node']['files'])})
    finally:
        shutil.rmtree(args.remote)
        shutil.copytree(baseline, args.remote, symlinks=True)
    if BENCH.fingerprint(args.source) != before:
        raise RuntimeError('source fixture changed')
    report = {'stage': str(stage), 'source': str(args.source), 'source_sha256': before,
              'remote': str(args.remote), 'remote_sha256': BENCH.fingerprint(baseline),
              'command': args.command, 'runs_ms': samples, 'verified': verified,
              'median_ms': {key: statistics.median(values) for key, values in samples.items()}}
    (stage / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
