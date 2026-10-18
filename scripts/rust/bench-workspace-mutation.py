#!/usr/bin/env python3
"""Compare complete workspace mutation commands with exact output and complete filesystem state.

Fixture creation is outside measurements. Existing qualified stash harness helpers
supply path-identical restoration, native-source fingerprints, presentation modes,
full object/state validation and narrowly validated history/cache timestamps.
"""
import argparse
import json
import platform
import os
import shlex
import statistics
import subprocess
import tempfile
import time
from pathlib import Path
import importlib.util
import sys
sys.dont_write_bytecode = True


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


COMMON = load('identity_common', 'bench-stash.py')
PREPARE = load('identity_prepare', 'prepare-workspace-mutation-benchmark.py')
STATE = COMMON.STATE


def host_snapshot():
    """Raw host counters for review; they include this benchmark's own work."""
    result = {'time_ns': time.time_ns(), 'cpu_count': os.cpu_count()}
    for name in ['stat', 'loadavg']:
        path = Path('/proc') / name
        if path.exists():
            result[name] = path.read_text()
    return result


def clock_phase(workload):
    """Control timestamp input outside timing, without changing either CLI's clock."""
    if workload != 'scope-rename-mixed':
        return None
    started = time.monotonic()
    while time.monotonic() - started < 10:
        now = time.time_ns()
        phase = now % 1_000_000_000
        if 50_000_000 <= phase < 100_000_000:
            return {'wall_time_ns': now, 'wait_ms': (time.monotonic() - started) * 1000}
        delay = (50_000_000 - phase) % 1_000_000_000
        time.sleep(delay / 1_000_000_000)
    raise RuntimeError('could not satisfy the predeclared scope rename start-clock phase')


def workspace_state(root, baseline_objects, baseline_history, workload):
    """Remove moves models/versions to trash; compare the exact removed IDs and preimages."""
    if workload != 'remove-tagged-batch':
        return STATE.state(root, baseline_objects, baseline_history)
    found = STATE.objects(root)
    retained = {key: value for key, value in baseline_objects.items() if key in found}
    result = STATE.state(root, retained, baseline_history)
    result['removed_objects'] = {
        key: [kind, STATE.sha(body), {'file': mode, 'prefix_directory': prefix_mode}]
        for key, (kind, body, mode, prefix_mode) in baseline_objects.items() if key not in found}
    return result


def execute(args, stage, fixtures, workload, mode, run, implementation):
    for source, name in [(fixtures['workloads'][workload], 'workspace'),
                         (fixtures['home'], 'home'), (fixtures['globals'], 'globals'),
                         (fixtures['remotes'][workload], 'remote')]:
        COMMON.restore(Path(source), stage / name)
    root = stage / 'workspace'
    baseline_objects, baseline_history = STATE.objects(root), STATE.bitmap_history(root)
    binary = args.node_binary if implementation == 'node' else args.rust
    before = COMMON.sha(binary)
    command = PREPARE.WORKLOADS[workload]
    argv = ([str(binary), str(args.node_cli)] if implementation == 'node' else [str(binary)]) + command
    if mode == 'tty':
        argv = ['script', '-q', '-e', '-c', shlex.join(argv), '/dev/null']
    environment = COMMON.environment(args, stage, mode)
    environment['BIT_NATIVE_QUIET'] = '1'
    phase = clock_phase(workload)
    host_before = host_snapshot()
    started = time.perf_counter()
    output = subprocess.run(argv, cwd=root, env=environment,
                            capture_output=True, timeout=300)
    elapsed = round((time.perf_counter() - started) * 1000, 3)
    host_after = host_snapshot()
    if COMMON.sha(binary) != before:
        raise RuntimeError('measured binary changed')
    prefix = stage / 'evidence' / f'{workload}-{mode}-{run}-{implementation}'
    prefix.with_suffix('.stdout').write_bytes(output.stdout)
    prefix.with_suffix('.stderr').write_bytes(output.stderr)
    if output.returncode:
        raise RuntimeError(f'{workload}/{mode}/{run}/{implementation} failed; evidence {prefix}')
    trace = output.stdout + output.stderr
    if implementation == 'rust':
        marker = f'running `{command[0]}` natively'.encode()
        if marker not in trace or b'declined' in trace or b'delegating:' in trace:
            raise RuntimeError(f'{prefix}: command did not remain native')
    prefix.with_suffix('.host.json').write_text(json.dumps({
        'before': host_before, 'after': host_after,
        'start_clock_phase': phase}, indent=2) + '\n')
    result = {'status': output.returncode, 'stdout': STATE.normalized(output.stdout),
              'stderr': STATE.normalized(output.stderr),
              'workspace': workspace_state(root, baseline_objects, baseline_history, workload),
              'globals': STATE.tree(stage / 'globals', globals_directory=True),
              'home': STATE.tree(stage / 'home'),
              'remote': STATE.tree(stage / 'remote')}
    prefix.with_suffix('.state.json').write_text(json.dumps(result, indent=2) + '\n')
    return elapsed, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['rust', 'node-binary', 'node-cli', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--stage', type=Path)
    parser.add_argument('--host-monitor', type=Path, help='external monitor evidence, copied after measurement')
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--workload', choices=list(PREPARE.WORKLOADS), action='append')
    args = parser.parse_args()
    if args.runs < 1:
        parser.error('--runs must be positive')
    for name in ['rust', 'node_binary', 'node_cli', 'output']:
        setattr(args, name, getattr(args, name).resolve())
    stage = args.stage.resolve() if args.stage else Path(tempfile.mkdtemp(prefix='workspace-mutation-bench-'))
    stage.mkdir(parents=True, exist_ok=True)
    (stage / 'evidence').mkdir(exist_ok=True)
    node_version = subprocess.check_output([str(args.node_binary), '--version'], text=True).strip()
    cli_package = args.node_cli.parent.parent / 'package.json'
    bit_version = json.loads(cli_package.read_text())['version']
    if node_version != 'v22.22.0' or bit_version != '2.2.94':
        raise RuntimeError('benchmark requires pinned Node22.22.0 / Bit2.2.94')
    manifest = stage / 'fixtures.json'
    if not manifest.exists():
        baselines, remotes, home, globals_directory = PREPARE.seed(args, stage, COMMON.environment(args, stage, 'timed'))
        manifest.write_text(json.dumps({'workloads': {key: str(value) for key, value in baselines.items()},
                                       'home': str(home), 'globals': str(globals_directory),
                                       'remotes': {key: str(value) for key, value in remotes.items()},
                                       'remote_path': str(stage / 'remote')}, indent=2) + '\n')
    fixtures = json.loads(manifest.read_text())
    if 'remotes' not in fixtures or fixtures.get('remote_path') != str(stage / 'remote'):
        raise RuntimeError('requires a fresh workspace mutation file-remote fixture stage')
    warm = stage / 'builtin-warmup'
    warm.mkdir(exist_ok=True)
    if not (warm / 'clean').exists():
        (warm / 'clean').symlink_to(fixtures['workloads']['remove-tagged-batch'], target_is_directory=True)
    fixtures['builtin_facts_prewarming'] = COMMON.PREPARE.prewarm_builtin_facts(
        args, warm, fixtures, COMMON.environment(args, stage, 'timed'))
    manifest.write_text(json.dumps(fixtures, indent=2) + '\n')
    if args.prepare_only:
        print(manifest)
        return
    source = Path(__file__).resolve().parents[2]
    source_before = COMMON.native_source(source)
    fixture_before = {key: COMMON.fingerprint(Path(value)) for key, value in fixtures['workloads'].items()}
    common_before = {key: COMMON.fingerprint(Path(fixtures[key])) for key in ['home', 'globals']}
    remote_before = {key: COMMON.fingerprint(Path(value)) for key, value in fixtures['remotes'].items()}
    helpers = ['bench-workspace-mutation.py', 'prepare-workspace-mutation-benchmark.py', 'prepare-stash-benchmark.py',
               'bench-stash.py', 'stash-benchmark-state.py']
    helper_before = {key: COMMON.sha(Path(__file__).with_name(key)) for key in helpers}
    binary_before = {key: COMMON.sha(getattr(args, key)) for key in ['rust', 'node_binary', 'node_cli']}
    measurements, verified = {}, []
    for workload in args.workload or list(PREPARE.WORKLOADS):
        measurements[workload] = {}
        for mode in ['timed', 'ci', 'tty']:
            samples = {'rust': [], 'node': []}
            for run in range(args.runs):
                pair = {}
                for implementation in (['node', 'rust'] if run % 2 == 0 else ['rust', 'node']):
                    elapsed, pair[implementation] = execute(args, stage, fixtures, workload, mode, run, implementation)
                    samples[implementation].append(elapsed)
                if pair['node'] != pair['rust']:
                    differences = [key for key in pair['node'] if pair['node'][key] != pair['rust'][key]]
                    raise RuntimeError(f'{workload}/{mode}/{run}: {differences} differ; evidence {stage}/evidence')
                verified.append({'workload': workload, 'mode': mode, 'pair': run,
                                 'native_ownership': True})
            native_ownership = True
            measurements[workload][mode] = {'native_ownership': native_ownership,
                'speed_claim_eligible': False, 'runs_ms': samples,
                'median_ms': {key: statistics.median(value) for key, value in samples.items()}}
            print(f'verified {workload} {mode}: {measurements[workload][mode]["median_ms"]}',
                  file=sys.stderr, flush=True)
    if COMMON.native_source(source) != source_before:
        raise RuntimeError('native sources changed during measurement')
    for key, before in fixture_before.items():
        if COMMON.fingerprint(Path(fixtures['workloads'][key])) != before:
            raise RuntimeError(f'fixture changed: {key}')
    for key, before in common_before.items():
        if COMMON.fingerprint(Path(fixtures[key])) != before:
            raise RuntimeError(f'common fixture changed: {key}')
    for key, before in remote_before.items():
        if COMMON.fingerprint(Path(fixtures['remotes'][key])) != before:
            raise RuntimeError(f'remote fixture changed: {key}')
    monitor = None
    if args.host_monitor:
        data = args.host_monitor.read_bytes()
        target = stage / 'host-monitor.json'
        target.write_bytes(data)
        monitor = {'path': str(target), 'sha256': COMMON.sha(target)}
    for key, before in helper_before.items():
        if COMMON.sha(Path(__file__).with_name(key)) != before:
            raise RuntimeError(f'benchmark helper changed: {key}')
    for key, before in binary_before.items():
        if COMMON.sha(getattr(args, key)) != before:
            raise RuntimeError(f'benchmark binary/entry changed: {key}')
    report = {'stage': str(stage), 'platform': platform.platform(), 'native_source': source_before,
              'correctness_valid': True, 'performance_valid': False,
              'performance_qualification': {
                  'status': 'awaiting closed whole-run external monitor qualification',
                  'predeclared_max_host_busy_percent': 80,
                  'required_sample_interval_seconds': 0.5,
                  'required_start_gate_seconds': 20,
                  'required_start_gate_max_busy_percent': 30},
              'rust_sha256': COMMON.sha(args.rust), 'node_binary_sha256': COMMON.sha(args.node_binary),
              'node_cli_sha256': COMMON.sha(args.node_cli), 'node_version': node_version,
              'bit_version': bit_version, 'fixtures': fixtures, 'fixture_sha256': fixture_before,
              'common_fixture_sha256': common_before, 'remote_fixture_sha256': remote_before,
              'host_monitor': monitor, 'host_command_samples': str(stage / 'evidence/*.host.json'),
              'reproduce': [sys.executable, *sys.argv],
              'helper_sha256': helper_before,
              'normalization': ['native trace', 'completed-in durations',
                                'validated command-history ISO timestamps/PIDs',
                                'validated bitmap/config history timestamps with full snapshots/reasons',
                                'checksum-validated cache-index receipt timestamps'],
              'excluded_implementation_state': ['exact workspace-root debug.log', 'exact globals/logs subtree'],
              'ownership_note': 'Every measured command must remain native in all three presentation modes.',
              'native_pairs': sum(row['native_ownership'] for row in verified),
              'warmup_note': 'Only explicitly recorded pinned builtin metadata is prewarmed; no first-use claim.',
              'fixture_prerequisites': {
                  'qualification_status': 'generated by pinned CLI; measured parity verified only for entries in verified',
                  'scope_history_collision_risk': 'Ten-component scope mutation has multiple writes and may exceed one second. Start phase alone does not prove stable backup collision shape; exact snapshot/count comparison remains mandatory. Preserve failed trials; a real callback barrier fixture requires explicit separate qualification.',
                  'seed_tag_policy': 'Seed-only tag ignores missing environment packages; measured commands carry no issue suppression.',
                  'recovery_baseline': 'Released delete of twenty tagged retained bitmap rows, recovered from local scope without remote import.',
                  'scope_baseline': 'Ten-component import chain; five tail components tagged/exported, five heads new; deprecate preserves exported originals.'},
              'clock_phase_control': {
                  'workloads': [name for name in PREPARE.WORKLOADS if name == 'scope-rename-mixed'],
                  'start_phase_ms': [50, 100],
                  'outside_command_timing': True,
                  'method': 'Wait before launch for the same wall-clock phase on both implementations; clocks and commands are unchanged.',
                  'reason': 'Published bitmap backup filenames have second precision; strict retained snapshot comparisons must not depend on crossing a clock boundary.'},
              'verified_pairs': len(verified), 'verified': verified, 'workloads': measurements}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
