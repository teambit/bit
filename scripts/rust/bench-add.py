#!/usr/bin/env python3
"""Compare complete add commands, output/failure prefixes and all filesystem state.

Fixture creation is outside measurements. Existing qualified stash harness helpers
supply path-identical restoration, native-source fingerprints, presentation modes,
full object/state validation and narrowly validated history/cache timestamps.
"""
import argparse
import json
import platform
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


COMMON = load('add_common', 'bench-stash.py')
PREPARE = load('add_prepare', 'prepare-add-benchmark.py')
STATE = COMMON.STATE


def execute(args, stage, fixtures, workload, mode, run, implementation):
    for source, name in [(fixtures['workloads'][workload], 'workspace'),
                         (fixtures['home'], 'home'), (fixtures['globals'], 'globals'),
                         (fixtures['remote'], 'remote')]:
        COMMON.restore(Path(source), stage / name)
    root = stage / 'workspace'
    baseline_objects, baseline_history = STATE.objects(root), STATE.bitmap_history(root)
    binary = args.node_binary if implementation == 'node' else args.rust
    before = COMMON.sha(binary)
    command = PREPARE.WORKLOADS[workload]
    argv = ([str(binary), str(args.node_cli)] if implementation == 'node' else [str(binary)]) + command
    if mode == 'tty':
        argv = ['script', '-q', '-e', '-c', shlex.join(argv), '/dev/null']
    started = time.perf_counter()
    environment = COMMON.environment(args, stage, mode)
    environment['BIT_NATIVE_QUIET'] = '1'
    output = subprocess.run(argv, cwd=root, env=environment,
                            capture_output=True, timeout=120)
    elapsed = round((time.perf_counter() - started) * 1000, 3)
    if COMMON.sha(binary) != before:
        raise RuntimeError('measured binary changed')
    prefix = stage / 'evidence' / f'{workload}-{mode}-{run}-{implementation}'
    prefix.with_suffix('.stdout').write_bytes(output.stdout)
    prefix.with_suffix('.stderr').write_bytes(output.stderr)
    trace = output.stdout + output.stderr
    native_ownership = not (mode == 'ci' and workload in {'ignored', 'link-failure'})
    if implementation == 'rust':
        actual_native = b'running `add` natively' in trace and b'delegating:' not in trace
        if actual_native != native_ownership or (not native_ownership and b'delegating:' not in trace):
            raise RuntimeError(f'{prefix}: unexpected native ownership; expected {native_ownership}')
    expected_failure = workload in {'ignored', 'link-failure'}
    if bool(output.returncode) != expected_failure:
        raise RuntimeError(f'{prefix}: unexpected exit status {output.returncode}')
    result = {'status': output.returncode, 'stdout': STATE.normalized(output.stdout),
              'stderr': STATE.normalized(output.stderr),
              'workspace': STATE.state(root, baseline_objects, baseline_history),
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
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--workload', choices=list(PREPARE.WORKLOADS), action='append')
    args = parser.parse_args()
    if args.runs < 1:
        parser.error('--runs must be positive')
    for name in ['rust', 'node_binary', 'node_cli', 'output']:
        setattr(args, name, getattr(args, name).resolve())
    stage = args.stage.resolve() if args.stage else Path(tempfile.mkdtemp(prefix='add-bench-'))
    stage.mkdir(parents=True, exist_ok=True)
    (stage / 'evidence').mkdir(exist_ok=True)
    node_version = subprocess.check_output([str(args.node_binary), '--version'], text=True).strip()
    cli_package = args.node_cli.parent.parent / 'package.json'
    bit_version = json.loads(cli_package.read_text())['version']
    if node_version != 'v22.22.0' or bit_version != '2.2.94':
        raise RuntimeError('benchmark requires pinned Node22.22.0 / Bit2.2.94')
    manifest = stage / 'fixtures.json'
    if not manifest.exists():
        baselines, home, globals_directory, remote = PREPARE.seed(args, stage, COMMON.environment(args, stage, 'timed'))
        manifest.write_text(json.dumps({'workloads': {key: str(value) for key, value in baselines.items()},
                                       'home': str(home), 'globals': str(globals_directory),
                                       'remote': str(remote), 'remote_path': str(stage / 'remote')}, indent=2) + '\n')
    fixtures = json.loads(manifest.read_text())
    if 'remote' not in fixtures or fixtures.get('remote_path') != str(stage / 'remote'):
        raise RuntimeError('requires a fresh add file-remote fixture stage')
    warm = stage / 'builtin-warmup'
    warm.mkdir(exist_ok=True)
    if not (warm / 'clean').exists():
        (warm / 'clean').symlink_to(fixtures['workloads']['readd'], target_is_directory=True)
    fixtures['builtin_facts_prewarming'] = COMMON.PREPARE.prewarm_builtin_facts(
        args, warm, fixtures, COMMON.environment(args, stage, 'timed'))
    manifest.write_text(json.dumps(fixtures, indent=2) + '\n')
    if args.prepare_only:
        print(manifest)
        return
    source = Path(__file__).resolve().parents[2]
    source_before = COMMON.native_source(source)
    fixture_before = {key: COMMON.fingerprint(Path(value)) for key, value in fixtures['workloads'].items()}
    common_before = {key: COMMON.fingerprint(Path(fixtures[key])) for key in ['home', 'globals', 'remote']}
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
                                 'native_ownership': not (mode == 'ci' and workload in {'ignored', 'link-failure'})})
            native_ownership = not (mode == 'ci' and workload in {'ignored', 'link-failure'})
            measurements[workload][mode] = {'native_ownership': native_ownership,
                'speed_claim_eligible': native_ownership, 'runs_ms': samples,
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
    helpers = ['bench-add.py', 'prepare-add-benchmark.py', 'prepare-stash-benchmark.py',
               'bench-stash.py', 'stash-benchmark-state.py']
    report = {'stage': str(stage), 'platform': platform.platform(), 'native_source': source_before,
              'rust_sha256': COMMON.sha(args.rust), 'node_binary_sha256': COMMON.sha(args.node_binary),
              'node_cli_sha256': COMMON.sha(args.node_cli), 'node_version': node_version,
              'bit_version': bit_version, 'fixtures': fixtures, 'fixture_sha256': fixture_before,
              'common_fixture_sha256': common_before,
              'helper_sha256': {key: COMMON.sha(Path(__file__).with_name(key)) for key in helpers},
              'normalization': ['native trace', 'completed-in durations',
                                'validated command-history ISO timestamps/PIDs',
                                'validated bitmap/config history timestamps with full snapshots/reasons',
                                'checksum-validated cache-index receipt timestamps'],
              'excluded_implementation_state': ['exact workspace-root debug.log', 'exact globals/logs subtree'],
              'ownership_note': 'CI ignored and link-failure delegate before effects; no native speed claim for these rows.',
              'native_pairs': sum(row['native_ownership'] for row in verified),
              'delegated_pairs': sum(not row['native_ownership'] for row in verified),
              'verified_pairs': len(verified), 'verified': verified, 'workloads': measurements}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
