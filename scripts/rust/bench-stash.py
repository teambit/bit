#!/usr/bin/env python3
"""Qualify complete stash workloads on identical restored paths in ordinary, TTY and CI modes.

Six workloads, five alternating implementation pairs per presentation mode by
 default. Fixture generation uses published Node 22 / Bit 2.2.94 outside timing.
Every command verifies output, native ownership and complete workspace/object state.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
sys.dont_write_bytecode = True


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PREPARE = load('stash_prepare', 'prepare-stash-benchmark.py')
STATE = load('stash_state', 'stash-benchmark-state.py')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fingerprint(root):
    digest = hashlib.sha256()
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root).as_posix().encode()
        if path.is_symlink():
            data = b'link\0' + os.fsencode(os.readlink(path))
        elif path.is_dir():
            data = b'directory'
        else:
            data = b'file\0' + path.read_bytes()
        digest.update(relative + b'\0' + data + b'\0')
    return digest.hexdigest()


def native_source(root):
    paths = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z', 'native'], cwd=root)
    digest = hashlib.sha256()
    count = 0
    for name in sorted(set(paths.split(b'\0')) - {b''}):
        path = root / os.fsdecode(name)
        if path.is_file():
            digest.update(name + b'\0' + path.read_bytes() + b'\0')
            count += 1
    return {'sha256': digest.hexdigest(), 'file_count': count}


def environment(args, stage, mode):
    env = os.environ.copy()
    for key in list(env):
        if key in {'BIT_NATIVE', 'BIT_NATIVE_QUIET', 'CI', 'FORCE_COLOR', 'NO_COLOR', 'NODE_DISABLE_COLORS'} or key.startswith('BIT_CONFIG_'):
            env.pop(key, None)
    env.update(HOME=str(stage / 'home'), USERPROFILE=str(stage / 'home'),
               BIT_GLOBALS_DIR=str(stage / 'globals'), BIT_NODE_BINARY=str(args.node_binary),
               BIT_NODE_CLI=str(args.node_cli), BIT_NATIVE_TRACE='1', NODE_NO_WARNINGS='1',
               GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull,
               PATH=str(args.node_binary.parent) + os.pathsep + env.get('PATH', ''))
    if mode == 'tty':
        env.update(TERM='dumb', FORCE_COLOR='1')
    elif mode == 'ci':
        env['CI'] = '1'
    return env


def restore(source, destination):
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination, symlinks=True)


def execute(args, stage, fixtures, workload, mode, run, label):
    for source, destination in [(fixtures['workloads'][workload], 'workspace'),
                                (fixtures['home'], 'home'), (fixtures['globals'], 'globals')]:
        restore(Path(source), stage / destination)
    root = stage / 'workspace'
    baseline_objects = STATE.objects(root)
    baseline_history = STATE.bitmap_history(root)
    command = PREPARE.WORKLOADS[workload]
    argv = ([str(args.node_binary), str(args.node_cli)] if label == 'node' else [str(args.rust)]) + command
    if mode == 'tty':
        argv = ['script', '-q', '-e', '-c', shlex.join(argv), '/dev/null']
    binary = args.node_binary if label == 'node' else args.rust
    before = sha(binary)
    start = time.perf_counter()
    output = subprocess.run(argv, cwd=root, env=environment(args, stage, mode),
                            capture_output=True, timeout=120)
    elapsed = round((time.perf_counter() - start) * 1000, 3)
    if sha(binary) != before:
        raise RuntimeError('measured binary changed during command')
    prefix = stage / 'evidence' / f'{workload}-{mode}-{run}-{label}'
    prefix.with_suffix('.stdout').write_bytes(output.stdout)
    prefix.with_suffix('.stderr').write_bytes(output.stderr)
    if output.returncode != 0:
        raise RuntimeError(f'{workload}/{mode}/{label} failed: see {prefix}')
    trace = output.stdout + output.stderr
    if output.returncode:
        raise RuntimeError(f'{prefix}: command exited {output.returncode}')
    if label == 'rust' and (b'running `stash` natively' not in trace or b'declined' in trace or b'delegating:' in trace):
        raise RuntimeError(f'{prefix}: stash delegated')
    result = {'status': output.returncode, 'stdout': STATE.normalized(output.stdout),
              'stderr': STATE.normalized(output.stderr),
              'workspace': STATE.state(root, baseline_objects, baseline_history),
              'globals': STATE.tree(stage / 'globals', globals_directory=True),
              'home': STATE.tree(stage / 'home')}
    prefix.with_suffix('.state.json').write_text(json.dumps(result, indent=2) + '\n')
    return elapsed, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['rust', 'node-binary', 'node-cli', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--stage', type=Path)
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--workload', choices=list(PREPARE.WORKLOADS), action='append')
    parser.add_argument('--debug-smoke', action='store_true')
    args = parser.parse_args()
    if args.runs < 1:
        parser.error('--runs must be positive')
    for name in ['rust', 'node_binary', 'node_cli', 'output']:
        setattr(args, name, getattr(args, name).resolve())
    stage = args.stage.resolve() if args.stage else Path(tempfile.mkdtemp(prefix='stash-bench-'))
    stage.mkdir(parents=True, exist_ok=True)
    versions = subprocess.check_output([str(args.node_binary), '--version'], text=True).strip()
    if not versions.startswith('v22.'):
        raise RuntimeError(f'Node 22 is required: {versions}')
    manifest = stage / 'fixtures.json'
    if not manifest.exists():
        baselines, home, globals_dir = PREPARE.seed(args, stage, environment(args, stage, 'timed'))
        fixtures = {'workloads': {name: str(path) for name, path in baselines.items()},
                    'home': str(home), 'globals': str(globals_dir), 'node_version': versions}
        manifest.write_text(json.dumps(fixtures, indent=2) + '\n')
    fixtures = json.loads(manifest.read_text())
    cli_package = args.node_cli.parent.parent / 'package.json'
    bit_version = json.loads(cli_package.read_text())['version']
    if bit_version != '2.2.94':
        raise RuntimeError(f'Bit 2.2.94 is required: {bit_version}')
    fixtures['builtin_facts_prewarming'] = PREPARE.prewarm_builtin_facts(
        args, stage, fixtures, environment(args, stage, 'timed'))
    manifest.write_text(json.dumps(fixtures, indent=2) + '\n')
    if args.prepare_only:
        print(json.dumps({'stage': str(stage), 'fixtures': fixtures}, indent=2))
        return
    (stage / 'evidence').mkdir(exist_ok=True)
    source = Path(__file__).resolve().parents[2]
    native_before = native_source(source)
    fixture_before = {name: fingerprint(Path(path)) for name, path in fixtures['workloads'].items()}
    common_before = {name: fingerprint(Path(fixtures[name])) for name in ['home', 'globals']}
    measurements, verified = {}, []
    for workload in args.workload or PREPARE.WORKLOADS:
        measurements[workload] = {}
        for mode in ['timed', 'tty', 'ci']:
            samples = {'node': [], 'rust': []}
            for run in range(args.runs):
                pair = {}
                for label in (['node', 'rust'] if run % 2 == 0 else ['rust', 'node']):
                    elapsed, pair[label] = execute(args, stage, fixtures, workload, mode, run, label)
                    samples[label].append(elapsed)
                if pair['node'] != pair['rust']:
                    different = [key for key in pair['node'] if pair['node'][key] != pair['rust'][key]]
                    raise RuntimeError(f'{workload} {mode} pair {run}: {different} differ; see {stage}/evidence')
                verified.append({'workload': workload, 'mode': mode, 'pair': run})
            measurements[workload][mode] = {'runs_ms': samples,
                'median_ms': {label: statistics.median(values) for label, values in samples.items()}}
            print(f'verified {workload} {mode}: {args.runs} pairs', file=sys.stderr, flush=True)
    if native_source(source) != native_before:
        raise RuntimeError('native source changed during benchmark')
    for name, path in fixtures['workloads'].items():
        if fingerprint(Path(path)) != fixture_before[name]:
            raise RuntimeError(f'fixture changed: {name}')
    for name, before in common_before.items():
        if fingerprint(Path(fixtures[name])) != before:
            raise RuntimeError(f'common fixture changed: {name}')
    report = {'stage': str(stage), 'publishable': not args.debug_smoke,
        'platform': platform.platform(), 'native_source': native_before, 'rust_sha256': sha(args.rust),
        'node_binary_sha256': sha(args.node_binary), 'node_cli_sha256': sha(args.node_cli),
        'node_version': versions, 'bit_version': bit_version,
        'bit_package_json_sha256': sha(cli_package),
        'published_stash_sha256': {path.name: sha(path) for path in
            sorted((cli_package.parent.parent / 'stash/dist').glob('stash*.js'))},
        'fixture_sha256': fixture_before, 'fixtures': fixtures,
        'common_fixture_sha256': common_before,
        'metadata_cache_fixture': fixtures['builtin_facts_prewarming'],
        'helper_sha256': {name: sha(Path(__file__).with_name(name)) for name in
            ['bench-stash.py', 'prepare-stash-benchmark.py', 'stash-benchmark-state.py']},
        'normalization': ['native trace', 'completed-in durations', 'history ISO timestamp/PID',
            'bitmap/workspace-config history timestamp filenames and matching metadata IDs',
            'bitmap history: preserve every baseline filename/byte/mode and metadata prefix; compare fresh ordered reasons, final backup and full snapshot sequence with adjacent IDENTICAL byte+mode snapshots deduplicated (published same-second filename overwrite)',
            'scope cache/components/{deps,docs}/index-v5: checksum-validated latest receipts per key, only time/metadata.timestamp removed; filenames, modes, integrity and content files stay exact',
            'fresh detached Version log.date ONLY for manifest isNew=true; only fresh stash-referenced Version hashes mapped'],
        'excluded_implementation_state': ['scope objects compared separately after decoding',
            'exact workspace-root debug.log', 'exact BIT_GLOBALS_DIR/logs subtree'],
        'verified_pairs': len(verified), 'verified': verified, 'workloads': measurements}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
