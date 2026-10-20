#!/usr/bin/env python3
"""Qualify full public list/cat commands against published Bit 2.2.94.

Seven workloads run on restored, path-identical workspace/home/globals/remote
fixtures in ordinary, CI and colored TTY modes. Five alternating Node/native
pairs per mode retain exact output and complete workspace/object/remote state.
Fixture preparation, released-CLI oracles and native metadata warming are
outside the measured command interval.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
import shlex
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


COMMON = load('inventory_common', 'bench-stash.py')
PREPARE = load('inventory_prepare', 'prepare-vcs-inventory-benchmark.py')
STATE = COMMON.STATE
HELPERS = ['bench-vcs-inventory.py', 'prepare-vcs-inventory-benchmark.py',
           'bench-stash.py', 'prepare-stash-benchmark.py', 'stash-benchmark-state.py']


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
    for name in ['workloads', 'remotes']:
        if set(fixtures[name]) != set(PREPARE.WORKLOADS):
            raise RuntimeError(f'incomplete frozen {name} fixture set')
    root = Path(fixtures['workloads'][workload])
    configured = json.loads((root / '.bit/scope.json').read_text())['remotes'][PREPARE.SCOPE]
    if configured != (stage / 'remote').as_uri():
        raise RuntimeError('workspace file remote would change absolute path on replay')
    return [(root, 'workspace'), (Path(fixtures['home']), 'home'),
            (Path(fixtures['globals']), 'globals'),
            (Path(fixtures['remotes'][workload]), 'remote')]


def execute(args, stage, fixtures, workload, mode, pair, implementation):
    for source, name in fixture_paths(stage, fixtures, workload):
        COMMON.restore(source, stage / name)
    root = stage / 'workspace'
    baseline_objects, baseline_history = STATE.objects(root), STATE.bitmap_history(root)
    raw_before = STATE.tree(STATE.scope(root) / 'objects')
    binary = args.node_binary if implementation == 'node' else args.rust
    command = PREPARE.WORKLOADS[workload]
    argv = ([str(binary), str(args.node_cli)] if implementation == 'node' else [str(binary)]) + command
    if mode == 'tty':
        argv = ['script', '-q', '-e', '-c', shlex.join(argv), '/dev/null']
    environment = COMMON.environment(args, stage, mode)
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
        raise RuntimeError(f'{workload}/{mode}/{pair}/{implementation} failed; see {prefix}')
    trace = output.stdout + output.stderr
    if implementation == 'rust':
        marker = f'running `{command[0]}` natively'.encode()
        if marker not in trace or b'declined' in trace or b'delegating:' in trace:
            raise RuntimeError(f'{prefix}: public command was not native')
    raw_after = STATE.tree(STATE.scope(root) / 'objects')
    if raw_after != raw_before:
        raise RuntimeError(f'{prefix}: read-only command rewrote compressed scope objects')
    result = {'status': output.returncode,
              'stdout': STATE.normalized(output.stdout),
              'stderr': STATE.normalized(output.stderr),
              'workspace': STATE.state(root, baseline_objects, baseline_history),
              'raw_objects': raw_after,
              'home': STATE.tree(stage / 'home'),
              'globals': STATE.tree(stage / 'globals', globals_directory=True),
              'remote': STATE.tree(stage / 'remote')}
    prefix.with_suffix('.state.json').write_text(json.dumps(result, indent=2) + '\n')
    return elapsed, result


def fingerprints(fixtures):
    return {'workloads': {name: COMMON.fingerprint(Path(path))
                          for name, path in fixtures['workloads'].items()},
            'remotes': {name: COMMON.fingerprint(Path(path))
                        for name, path in fixtures['remotes'].items()},
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
        baselines, remotes, home, globals_dir = PREPARE.seed(
            args, stage, COMMON.environment(args, stage, 'timed'))
        manifest.write_text(json.dumps({
            'workloads': {key: str(value) for key, value in baselines.items()},
            'remotes': {key: str(value) for key, value in remotes.items()},
            'home': str(home), 'globals': str(globals_dir),
            'remote_path': str(stage / 'remote')}, indent=2) + '\n')
    fixtures = json.loads(manifest.read_text())
    for workload in PREPARE.WORKLOADS:
        fixture_paths(stage, fixtures, workload)
    fixtures['builtin_facts_prewarming'] = COMMON.PREPARE.prewarm_builtin_facts(
        args, stage, fixtures, COMMON.environment(args, stage, 'timed'))
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
    stage = args.stage.resolve() if args.stage else Path(tempfile.mkdtemp(prefix='vcs-inventory-bench-'))
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
                'median_ms': {key: statistics.median(values) for key, values in samples.items()}}
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
              'qualification_eligible': not args.debug_smoke and args.runs == 5,
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
                                'validated command-history timestamps/PIDs',
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
