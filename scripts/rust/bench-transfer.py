#!/usr/bin/env python3
"""Measure complete transfers on fresh copies, verifying every pair and restoring remotes.

Use only disposable fixture remotes. Output, workspace files, scope indexes, control
files and inflated scope objects are compared after every command in all three
presentation modes. Only trace lines, durations, export allocation dates and proven
remote history and component-index insertion order differ.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shlex
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
import zlib

sys.dont_write_bytecode = True


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BENCH = load('benchmark', 'bench-native-command.py')
VERIFY = load('verification', 'verify-native-command.py')


def normalize(text, root):
    return VERIFY.normalized(text).replace(str(root), 'WORKSPACE')


def object_bytes(path, remote):
    raw = zlib.decompress(path.read_bytes())
    header, separator, body = raw.partition(b'\0')
    kind = header.split(b' ', 1)[0]
    normalized = {b'Component', b'ExportMetadata'}
    if remote:
        normalized.add(b'VersionHistory')
    if not separator or kind not in normalized:
        return raw.hex()
    value = json.loads(body)
    if kind == b'ExportMetadata':
        value.pop('exportDate', None)
    elif kind == b'VersionHistory':
        # The published server concurrently inserts these cache rows; every row stays exact.
        value['versions'].sort(key=lambda row: row['hash'])
    else:
        for field in ['remotes', 'scopeList', 'scopesList']:
            for row in value.get(field, []):
                row.pop('date', None)
    return [header.decode(), json.dumps(value, separators=(',', ':'), ensure_ascii=False)]


def remote_index(text):
    value = json.loads(text)
    if json.dumps(value, indent=2, ensure_ascii=False) + '\n' != text:
        raise RuntimeError('remote index serialization changed')
    value['components'].sort(key=lambda row: (row['id']['scope'], row['id']['name']))
    return json.dumps(value, indent=2, ensure_ascii=False) + '\n'


def scope_state(scope, remote=False):
    objects = {}
    for prefix in sorted((scope / 'objects').iterdir()):
        if not prefix.is_dir() or len(prefix.name) != 2:
            continue
        for path in sorted(prefix.iterdir()):
            if path.is_file():
                objects[prefix.name + path.name] = object_bytes(path, remote)
    controls = {}
    for name in ['index.json', 'staged-snaps', 'unmerged', 'last-merged', 'merge-conflict']:
        path = scope / name
        if path.is_file():
            text = path.read_text()
            controls[name] = remote_index(text) if remote and name == 'index.json' else text
    staged = scope / 'staged-config'
    if staged.is_dir():
        controls['staged-config'] = {str(p.relative_to(staged)): p.read_text()
                                     for p in sorted(staged.rglob('*')) if p.is_file()}
    refs = scope / 'refs'
    if refs.is_dir():
        controls['refs'] = {str(p.relative_to(refs)): p.read_text()
                            for p in sorted(refs.rglob('*')) if p.is_file()}
    return {'objects': objects, 'controls': controls}


def workspace_packages(root):
    packages = {}
    modules = root / 'node_modules'
    manifests = [*modules.glob('*/package.json'), *modules.glob('@*/*/package.json')]
    for manifest in sorted(manifests):
        if not json.loads(manifest.read_text()).get('componentId'):
            continue
        for path in sorted(manifest.parent.rglob('*')):
            relative = str(path.relative_to(root))
            if path.is_symlink():
                packages[relative] = ['symlink', os.readlink(path).replace(str(root), 'WORKSPACE')]
            elif path.is_file():
                packages[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    return packages


def workspace_state(root):
    files = {}
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if {'.git', '.bit', 'node_modules'}.intersection(relative.parts):
            continue
        if path.is_symlink():
            files[str(relative)] = ['symlink', os.readlink(path)]
        elif path.is_file():
            files[str(relative)] = hashlib.sha256(path.read_bytes()).hexdigest()
    scope = root / '.bit'
    if not scope.is_dir():
        scope = root / '.git/bit'
    return {'files': files, 'packages': workspace_packages(root), 'scope': scope_state(scope)}


def execute(args, stage, run, label, mode, baselines):
    root = stage / f'{mode}-{run}-{label}'
    shutil.copytree(args.source, root, symlinks=True)
    for remote, baseline in baselines.items():
        shutil.rmtree(remote)
        shutil.copytree(baseline, remote, symlinks=True)
    environment = os.environ.copy()
    for key in ['BIT_NATIVE', 'CI', 'FORCE_COLOR', 'NO_COLOR', 'NODE_DISABLE_COLORS']:
        environment.pop(key, None)
    environment.update(BIT_NATIVE_TRACE='1', NODE_NO_WARNINGS='1')
    if mode == 'ci':
        environment['CI'] = '1'
    command = [str(args.node if label == 'node' else args.rust), *args.command]
    if mode == 'tty':
        environment.update(TERM='dumb', FORCE_COLOR='1')
        command = ['script', '-q', '-e', '-c', shlex.join(command), '/dev/null']
    started = time.perf_counter()
    output = subprocess.run(command, cwd=root, env=environment, capture_output=True, check=False)
    elapsed = round((time.perf_counter() - started) * 1000, 3)
    for stream in ['stdout', 'stderr']:
        root.with_name(root.name + '.' + stream).write_bytes(getattr(output, stream))
    trace = output.stdout + output.stderr
    if output.returncode or (label == 'rust' and (
            b'declined' in trace or b'delegating:' in trace
            or f'running `{args.command[0]}` natively'.encode() not in trace)):
        raise RuntimeError(f'{root}: command failed or delegated')
    state = {'stdout': normalize(output.stdout.decode(), root),
             'stderr': normalize(output.stderr.decode(), root),
             'workspace': workspace_state(root),
             'remotes': {str(remote): scope_state(remote, remote=True) for remote in baselines}}
    return elapsed, state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['source', 'node', 'rust']:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--remote', type=Path, action='append', required=True)
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    args.command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if args.runs < 1 or not args.command:
        parser.error('positive runs and a command required')
    for name in ['source', 'node', 'rust']:
        setattr(args, name, getattr(args, name).resolve())
    stage = Path(tempfile.mkdtemp(prefix='transfer-bench-'))
    baselines = {remote.resolve(): stage / f'remote-baseline-{index}'
                 for index, remote in enumerate(args.remote)}
    for remote, baseline in baselines.items():
        shutil.copytree(remote, baseline, symlinks=True)
    before = BENCH.fingerprint(args.source)
    samples = {mode: {'node': [], 'rust': []} for mode in ['timed', 'tty', 'ci']}
    verified = []
    try:
        for mode, measurements in samples.items():
            for run in range(args.runs):
                pair = {}
                for label in (['node', 'rust'] if run % 2 == 0 else ['rust', 'node']):
                    elapsed, pair[label] = execute(args, stage, run, label, mode, baselines)
                    measurements[label].append(elapsed)
                for key in pair['node']:
                    if pair['node'][key] != pair['rust'][key]:
                        (stage / 'mismatch.json').write_text(json.dumps(pair, indent=2))
                        raise RuntimeError(f'{mode} run {run}: {key} differs: {stage}')
                verified.append({'mode': mode, 'run': run})
    finally:
        for remote, baseline in baselines.items():
            shutil.rmtree(remote)
            shutil.copytree(baseline, remote, symlinks=True)
    for remote, baseline in baselines.items():
        if BENCH.fingerprint(remote) != BENCH.fingerprint(baseline):
            raise RuntimeError(f'remote fixture was not restored: {remote}')
    if BENCH.fingerprint(args.source) != before:
        raise RuntimeError('source fixture changed')
    report = {'stage': str(stage), 'source': str(args.source), 'source_sha256': before,
              'remote_sha256': {str(remote): BENCH.fingerprint(baseline)
                                for remote, baseline in baselines.items()},
              'rust_sha256': hashlib.sha256(args.rust.read_bytes()).hexdigest(),
              'command': args.command, 'runs_ms': samples, 'verified': verified,
              'median_ms': {mode: {label: statistics.median(values)
                                  for label, values in measurements.items()}
                            for mode, measurements in samples.items()}}
    (stage / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
