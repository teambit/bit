#!/usr/bin/env python3
"""Qualify full public closeout commands against published Bit 2.2.94.

Frozen workloads replay at the same absolute workspace/home/globals/remote
paths in ordinary, CI and colored TTY modes. Each mode retains five alternating
Node/native pairs with exact output and full workspace/raw-object/remote state.
Fixture preparation and native metadata warming are outside the measured
command interval. Each measured Node run is an independent released-CLI oracle.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
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


COMMON = load('closeout_common', 'bench-stash.py')
PREPARE = load('closeout_prepare', 'prepare-vcs-closeout-benchmark.py')
STATE = COMMON.STATE
HISTORY = load('closeout_history', 'prepare-vcs-closeout-history-oracle.py')
HELPERS = ['bench-vcs-closeout.py', 'prepare-vcs-closeout-benchmark.py',
           'bench-stash.py', 'prepare-stash-benchmark.py', 'stash-benchmark-state.py',
           'prepare-vcs-closeout-history-oracle.py', 'prepare-lane-restoration-history-oracle.py',
           'prepare-bitmap-history-oracle.py', 'bitmap-history-oracle.py',
           'scope-bitmap-history-oracle.cjs']


def host_snapshot():
    result = {'time_ns': time.time_ns(), 'cpu_count': os.cpu_count()}
    for name in ['stat', 'loadavg']:
        path = Path('/proc') / name
        if path.exists():
            result[name] = path.read_text()
    return result


def fixture_paths(stage, fixtures, workload):
    if fixtures.get('remote_path') != str(stage / 'remote'):
        raise RuntimeError('remote must retain its original absolute stage/remote path')
    if fixtures.get('original_remote_path') != str(stage / 'remote-original'):
        raise RuntimeError('original remote must retain its absolute path')
    for name in ['workloads', 'remotes', 'original_remotes']:
        if set(fixtures[name]) != set(PREPARE.WORKLOADS):
            raise RuntimeError(f'incomplete frozen {name} fixture set')
    root = Path(fixtures['workloads'][workload])
    configured = json.loads((root / '.bit/scope.json').read_text())['remotes'][PREPARE.SCOPE]
    if configured != (stage / 'remote').as_uri():
        raise RuntimeError('workspace file remote would change absolute path on replay')
    if workload == 'fetch-original-scopes':
        original = json.loads((root / '.bit/scope.json').read_text())['remotes'][PREPARE.ORIGINAL]
        if original != (stage / 'remote-original').as_uri():
            raise RuntimeError('original file remote would change absolute path on replay')
    return [(root, 'workspace'), (Path(fixtures['home']), 'home'),
            (Path(fixtures['globals']), 'globals'),
            (Path(fixtures['remotes'][workload]), 'remote'),
            (Path(fixtures['original_remotes'][workload]), 'remote-original')]


def command_output(data, workload):
    text = STATE.normalized(data)
    if workload != 'hard-delete-wildcard':
        return text
    # Scope.filterFoundAndMissingComponents pushes successful concurrent loads.
    # Only these two validated success items have unspecified relative order.
    lines = text.splitlines(keepends=True)
    expected = {f'{PREPARE.SCOPE}/comp1', f'{PREPARE.SCOPE}/comp2'}
    found = []
    for index, line in enumerate(lines):
        plain = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', line).rstrip('\r\n')
        if plain.startswith('   › '):
            identity = plain.removeprefix('   › ')
            if identity not in expected:
                raise RuntimeError('unexpected hard-delete success item')
            found.append((index, identity, line))
    if len(found) != 2 or {row[1] for row in found} != expected:
        raise RuntimeError('missing or duplicate hard-delete success items')
    for (index, _, _), (_, _, line) in zip(found, sorted(found, key=lambda row: row[1])):
        lines[index] = line
    return ''.join(lines)


def strict_objects(scope):
    result = {}
    directory = scope / 'objects'
    if directory.is_symlink() or not directory.is_dir():
        raise RuntimeError('nonregular repository object root')
    for prefix in directory.iterdir():
        if prefix.is_symlink() or not prefix.is_dir() or not re.fullmatch('[0-9a-f]{2}', prefix.name):
            raise RuntimeError(f'invalid repository object prefix: {prefix}')
        if any(not re.fullmatch('[0-9a-f]{38}', child.name) for child in prefix.iterdir()):
            raise RuntimeError(f'invalid repository object filename: {prefix}')
    for path in sorted(directory.glob('*/*')):
        if path.is_symlink() or not path.is_file():
            raise RuntimeError(f'nonregular repository object: {path}')
        packed = path.read_bytes()
        header, separator, body = zlib.decompress(packed).partition(b'\0')
        reference = path.parent.name + path.name
        kind = header.split(b' ', 1)[0].decode()
        length = len(body.decode('utf-8', errors='replace').encode('utf-16-le')) // 2
        if not separator or header != f'{kind} {reference} {length}'.encode():
            raise RuntimeError(f'invalid object identity/length: {path}')
        result[reference] = (kind, body, path.stat().st_mode & 0o7777,
                             path.parent.stat().st_mode & 0o7777, STATE.sha(packed))
    return result


def workspace_state(root, baseline, baseline_history, remote_objects, history_projection):
    found = strict_objects(STATE.scope(root))
    missing = baseline.keys() - found.keys()
    if missing:
        raise RuntimeError(f'baseline repository objects removed: {sorted(missing)}')
    for reference, row in found.items():
        if reference in baseline:
            original = baseline[reference]
            if row[0] != original[0]:
                raise RuntimeError('existing repository object kind changed')
            if row[0] in {'Version', 'Source'} and row != original:
                raise RuntimeError(f'immutable repository object changed: {reference}')
        elif row[0] in {'Version', 'Source'}:
            expected = remote_objects.get(reference)
            if expected is None or (row[0], row[1], row[4]) != (expected[0], expected[1], expected[4]):
                raise RuntimeError(f'new immutable object lacks exact remote proof: {reference}')
    directory = STATE.scope(root) / 'objects'
    return {'tree': STATE.tree(root, workspace=True),
            'objects': {ref: [row[0], STATE.sha(row[1]), row[2], row[3], row[4]]
                        for ref, row in found.items()},
            'objects_directory_mode': directory.stat().st_mode & 0o7777,
            'empty_object_prefixes': {path.name: path.stat().st_mode & 0o7777
                                     for path in directory.iterdir()
                                     if path.is_dir() and not any(path.iterdir())},
            'bitmap_history': (STATE.qualified_bitmap_history(root, baseline_history)
                               if history_projection is None else history_projection)}


def execute(args, stage, fixtures, workload, mode, pair, implementation):
    for source, name in fixture_paths(stage, fixtures, workload):
        COMMON.restore(source, stage / name)
    root = stage / 'workspace'
    baseline_objects, baseline_history = strict_objects(STATE.scope(root)), STATE.bitmap_history(root)
    remote_objects = strict_objects(stage / 'remote')
    for reference, row in strict_objects(stage / 'remote-original').items():
        if row[0] in {'Version', 'Source'} and reference in remote_objects \
                and remote_objects[reference][:2] != row[:2]:
            raise RuntimeError('different immutable remote object payloads under one reference')
        remote_objects.setdefault(reference, row)
    raw_before = STATE.tree(STATE.scope(root) / 'objects')
    binary = args.node_binary if implementation == 'node' else args.rust
    command = PREPARE.WORKLOADS[workload]
    argv = ([str(binary), str(args.node_cli)] if implementation == 'node' else [str(binary)]) + command
    if mode == 'tty':
        argv = ['script', '-q', '-e', '-c', shlex.join(argv), '/dev/null']
    environment = COMMON.environment(args, stage, mode)
    # The published interactive hard-delete gate is explicitly enabled for
    # both implementations of these fixtures, never only for the native CLI.
    environment.pop('BIT_FEATURES', None)
    environment.pop('NODE_OPTIONS', None)
    if implementation == 'node':
        environment['BIT_NATIVE'] = 'off'
    if workload in PREPARE.HARD_DELETE:
        environment['BIT_FEATURES'] = 'hard-delete'
    environment['BIT_NATIVE_QUIET'] = '1'
    before_binary = COMMON.sha(binary)
    host_before = host_snapshot()
    started = time.perf_counter()
    output = subprocess.run(argv, cwd=root, env=environment, capture_output=True, timeout=300)
    elapsed = round((time.perf_counter() - started) * 1000, 3)
    host_after = host_snapshot()
    if COMMON.sha(binary) != before_binary:
        raise RuntimeError('measured binary changed during command')
    prefix = stage / 'evidence' / f'{workload}-{mode}-{pair}-{implementation}'
    prefix.with_suffix('.stdout').write_bytes(output.stdout)
    prefix.with_suffix('.stderr').write_bytes(output.stderr)
    prefix.with_suffix('.host.json').write_text(json.dumps({
        'before': host_before, 'after': host_after}, indent=2) + '\n')
    if output.returncode:
        raise RuntimeError(f'{workload}/{mode}/{pair}/{implementation} has unexpected status; '
                           f'see {prefix}')
    trace = output.stdout + output.stderr
    if implementation == 'rust':
        marker = f'running `{command[0]}` natively'.encode()
        if marker not in trace or b'declined' in trace or b'delegating:' in trace:
            raise RuntimeError(f'{prefix}: public command was not native')
    raw_after = STATE.tree(STATE.scope(root) / 'objects')
    history_projection = None
    if workload in HISTORY.HISTORY_REASONS:
        oracle = HISTORY.frozen(fixtures, workload)
        raw_path = prefix.with_suffix('.bitmap-history.json')
        pending = {'validation_status': 'pending', 'oracle': oracle,
                   'baseline': baseline_history, 'raw_history': HISTORY.CORE.raw_history(root)}
        raw_path.write_text(json.dumps(pending, indent=2) + '\n')
        try:
            history_projection, raw = HISTORY.VALIDATOR.validate(
                root, baseline_history, oracle, host_before['time_ns'], host_after['time_ns'],
                expected_transitions=len(HISTORY.HISTORY_REASONS[workload]))
        except (ValueError, OSError) as error:
            pending.update(validation_status='failed', error=str(error))
            raw_path.write_text(json.dumps(pending, indent=2) + '\n')
            raise
        raw_path.write_text(json.dumps(raw, indent=2) + '\n')
    result = {'status': output.returncode,
              'stdout': command_output(output.stdout, workload),
              'stderr': STATE.normalized(output.stderr),
              'workspace': workspace_state(root, baseline_objects, baseline_history,
                                           remote_objects, history_projection),
              'raw_objects_before': raw_before,
              'raw_objects': raw_after,
              'home': STATE.tree(stage / 'home'),
              'globals': STATE.tree(stage / 'globals', globals_directory=True),
              'remote': STATE.tree(stage / 'remote'),
              'original_remote': STATE.tree(stage / 'remote-original')}
    prefix.with_suffix('.state.json').write_text(json.dumps(result, indent=2) + '\n')
    return elapsed, result


def fingerprints(fixtures):
    return {'workloads': {name: COMMON.fingerprint(Path(path))
                          for name, path in fixtures['workloads'].items()},
            'remotes': {name: COMMON.fingerprint(Path(path))
                        for name, path in fixtures['remotes'].items()},
            'original_remotes': {name: COMMON.fingerprint(Path(path))
                                 for name, path in fixtures['original_remotes'].items()},
            'home': COMMON.fingerprint(Path(fixtures['home'])),
            'globals': COMMON.fingerprint(Path(fixtures['globals']))}


def prerequisite(args, stage):
    node_version = subprocess.check_output([str(args.node_binary), '--version'], text=True).strip()
    package = args.node_cli.parent.parent / 'package.json'
    bit_version = json.loads(package.read_text())['version']
    if node_version != 'v22.22.0' or bit_version != '2.2.94':
        raise RuntimeError('requires pinned Node22.22.0 and published Bit2.2.94')
    manifest = stage / 'fixtures.json'
    if not manifest.exists():
        environment = COMMON.environment(args, stage, 'timed')
        environment.pop('BIT_FEATURES', None)
        environment.pop('NODE_OPTIONS', None)
        environment['BIT_NATIVE'] = 'off'
        baselines, remotes, originals, home, globals_dir = PREPARE.seed(args, stage, environment)
        manifest.write_text(json.dumps({
            'workloads': {key: str(value) for key, value in baselines.items()},
            'remotes': {key: str(value) for key, value in remotes.items()},
            'original_remotes': {key: str(value) for key, value in originals.items()},
            'home': str(home), 'globals': str(globals_dir),
            'remote_path': str(stage / 'remote'),
            'original_remote_path': str(stage / 'remote-original')}, indent=2) + '\n')
    fixtures = json.loads(manifest.read_text())
    for workload in PREPARE.WORKLOADS:
        fixture_paths(stage, fixtures, workload)
    environment = COMMON.environment(args, stage, 'timed')
    environment.pop('BIT_FEATURES', None)
    environment.pop('NODE_OPTIONS', None)
    warm_stage = stage / 'builtin-prewarming'
    if not warm_stage.exists():
        warm_stage.mkdir()
        clean = warm_stage / 'clean'
        shutil.copytree(stage / 'clean', clean, symlinks=True)
        (clean / 'warmup').mkdir()
        (clean / 'warmup/index.js').write_text("module.exports = require('node:fs');\n")
        seeded = subprocess.run([str(args.node_binary), str(args.node_cli),
                                 'add', 'warmup', '-i', 'metadata-warmup'],
                                cwd=clean, env=environment, capture_output=True, timeout=120)
        (warm_stage / 'seed.stdout').write_bytes(seeded.stdout)
        (warm_stage / 'seed.stderr').write_bytes(seeded.stderr)
        if seeded.returncode:
            raise RuntimeError('published builtin metadata warmup fixture failed')
    fixtures['builtin_facts_prewarming'] = COMMON.PREPARE.prewarm_builtin_facts(
        args, warm_stage, fixtures, environment)
    fixtures['commands'] = PREPARE.WORKLOADS
    selected_histories = set(HISTORY.HISTORY_REASONS) & set(PREPARE.WORKLOADS)
    if selected_histories:
        if args.prepare_only:
            HISTORY.prepare(args, stage, fixtures, environment)
        for workload in selected_histories:
            HISTORY.frozen(fixtures, workload)
    manifest.write_text(json.dumps(fixtures, indent=2) + '\n')
    return fixtures, node_version, bit_version, package


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['rust', 'node-binary', 'node-cli', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--stage', type=Path)
    parser.add_argument('--host-monitor', type=Path)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--debug-smoke', action='store_true')
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--workload', choices=list(PREPARE.WORKLOADS), action='append')
    args = parser.parse_args()
    if args.runs != 5 and not args.debug_smoke:
        parser.error('publishable qualification requires exactly five pairs per mode')
    if args.runs < 1:
        parser.error('--runs must be positive')
    if args.workload and len(args.workload) != len(set(args.workload)):
        parser.error('a workload may only be selected once per attempt')
    for name in ['rust', 'node_binary', 'node_cli', 'output']:
        setattr(args, name, getattr(args, name).resolve())
    stage = args.stage.resolve() if args.stage else Path(tempfile.mkdtemp(prefix='vcs-closeout-bench-'))
    stage.mkdir(parents=True, exist_ok=True)
    fixtures, node_version, bit_version, package = prerequisite(args, stage)
    if args.prepare_only:
        print(json.dumps({'stage': str(stage), 'fixtures': fixtures}, indent=2))
        return
    (stage / 'evidence').mkdir(exist_ok=True)
    source = Path(__file__).resolve().parents[2]
    native_before = COMMON.native_source(source)
    fixtures_before = fingerprints(fixtures)
    helper_before = {name: COMMON.sha(Path(__file__).with_name(name)) for name in HELPERS}
    binary_before = {name: COMMON.sha(getattr(args, name))
                     for name in ['rust', 'node_binary', 'node_cli']}
    package_before = COMMON.sha(package)
    measurements, verified = {}, []
    for workload in args.workload or PREPARE.WORKLOADS:
        measurements[workload] = {}
        for mode in ['timed', 'ci', 'tty']:
            samples = {'node': [], 'rust': []}
            for pair_index in range(args.runs):
                pair = {}
                order = ['node', 'rust'] if pair_index % 2 == 0 else ['rust', 'node']
                for implementation in order:
                    elapsed, pair[implementation] = execute(
                        args, stage, fixtures, workload, mode, pair_index, implementation)
                    samples[implementation].append(elapsed)
                if pair['node'] != pair['rust']:
                    different = [key for key in pair['node'] if pair['node'][key] != pair['rust'][key]]
                    raise RuntimeError(f'{workload}/{mode}/{pair_index}: {different} differ; '
                                       f'see {stage}/evidence')
                verified.append({'workload': workload, 'mode': mode, 'pair': pair_index,
                                 'native_ownership': True})
            measurements[workload][mode] = {
                'native_ownership': True,
                'runs_ms': samples,
                'median_ms': {key: statistics.median(values) for key, values in samples.items()},
                'performance_claim_eligible': workload not in PREPARE.CORRECTNESS_ONLY}
            print(f'verified {workload} {mode}: {args.runs} pairs', file=sys.stderr, flush=True)
    if COMMON.native_source(source) != native_before or fingerprints(fixtures) != fixtures_before:
        raise RuntimeError('native source or frozen fixture changed during qualification')
    if any(COMMON.sha(Path(__file__).with_name(name)) != digest
           for name, digest in helper_before.items()):
        raise RuntimeError('benchmark helper changed during qualification')
    if any(COMMON.sha(getattr(args, name)) != digest for name, digest in binary_before.items()):
        raise RuntimeError('binary or Node entry changed during qualification')
    if COMMON.sha(package) != package_before:
        raise RuntimeError('published package manifest changed during qualification')
    monitor = None
    if args.host_monitor:
        monitor_path = stage / 'host-monitor.json'
        monitor_path.write_bytes(args.host_monitor.read_bytes())
        monitor = {'path': str(monitor_path), 'sha256': COMMON.sha(monitor_path)}
    report = {'stage': str(stage), 'platform': platform.platform(),
              'node_version': node_version, 'bit_version': bit_version,
              'correctness_valid': True, 'performance_valid': False,
              'workload_count': len(measurements),
              'complete_workload_set': set(measurements) == set(PREPARE.WORKLOADS),
              'full_closeout_coverage': False,
              'separate_tooling_workloads': PREPARE.COMPANION_TOOLING,
              'qualification_eligible': not args.debug_smoke and args.runs == 5,
              'successful_workloads': sorted(set(measurements) - PREPARE.CORRECTNESS_ONLY),
              'correctness_only_workloads': sorted(set(measurements) & PREPARE.CORRECTNESS_ONLY),
              'performance_qualification': {'status': 'awaiting full external CPU monitor audit',
                  'predeclared_max_host_busy_percent': 80,
                  'required_sample_interval_seconds': 0.5,
                  'required_start_gate_seconds': 20,
                  'required_start_gate_max_busy_percent': 30},
              'native_source': native_before, 'helper_sha256': helper_before,
              'binary_sha256': binary_before, 'rust_sha256': binary_before['rust'],
              'native_pairs': len(verified), 'bit_package_json_sha256': package_before,
              'fixtures': fixtures, 'fixture_sha256': fixtures_before,
              'host_monitor': monitor, 'host_command_samples': str(stage / 'evidence/*.host.json'),
              'normalization': ['native trace', 'completed-in durations',
                                'validated unordered wildcard hard-delete success items',
                                'validated command-history timestamps/PIDs',
                                'independent Node bitmap write transcript for active-lane fetch-deps',
                                'checksum-validated cache-index receipt timestamps'],
              'excluded_implementation_state': ['workspace-root debug.log',
                                                 'BIT_GLOBALS_DIR/logs subtree'],
              'reproduce': [sys.executable, *sys.argv],
              'verified_pairs': len(verified), 'verified': verified,
              'workloads': measurements}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
