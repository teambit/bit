#!/usr/bin/env python3
"""Compare complete lane adoption commands with exact output and complete filesystem state.

Fixture creation is outside measurements. Existing qualified stash harness helpers
supply path-identical restoration, native-source fingerprints, presentation modes,
full object/state validation and narrowly validated history/cache timestamps.
"""
import argparse
import base64
import datetime
import email.utils
import json
import platform
import re
import os
import shlex
import statistics
import subprocess
import shutil
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


COMMON = load('lane_common', 'bench-stash.py')
PREPARE = load('lane_prepare', 'prepare-lane-adoption-benchmark.py')
STATE = COMMON.STATE
HISTORY = load('lane_bitmap_validator', 'bitmap-history-oracle.py')
HISTORY_PREPARE = load('lane_bitmap_prepare', 'prepare-lane-bitmap-history-oracle.py')
IMPORT_STATE = load('lane_import_state', 'bench-import-adoption.py')


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
    started = time.monotonic()
    while time.monotonic() - started < 10:
        now = time.time_ns()
        phase = now % 1_000_000_000
        if 50_000_000 <= phase < 100_000_000:
            return {'wall_time_ns': now, 'wait_ms': (time.monotonic() - started) * 1000}
        delay = (50_000_000 - phase) % 1_000_000_000
        time.sleep(delay / 1_000_000_000)
    raise RuntimeError('could not satisfy the predeclared lane start-clock phase')


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
    if workload in PREPARE.INSTALLATIONS and any(
            title in output.stdout + output.stderr for title in [b'Installation Error', b'Compilation Error']):
        raise RuntimeError(f'{prefix}: graceful tooling failure does not qualify successful installation')
    trace = output.stdout + output.stderr
    if implementation == 'rust':
        marker = f'running `{command[0]}` natively'.encode()
        if marker not in trace or b'declined' in trace or b'delegating:' in trace:
            raise RuntimeError(f'{prefix}: command did not remain native')
    prefix.with_suffix('.host.json').write_text(json.dumps({
        'before': host_before, 'after': host_after,
        'start_clock_phase': phase}, indent=2) + '\n')
    history_projection = None
    if workload in HISTORY_PREPARE.WORKLOADS:
        oracle = HISTORY_PREPARE.frozen(fixtures, workload)
        raw_path = prefix.with_suffix('.bitmap-history.json')
        pending = {'validation_status': 'pending',
                   'raw_history': HISTORY_PREPARE.CORE.raw_history(root),
                   'baseline': baseline_history, 'oracle': oracle,
                   'interval_start_ns': host_before['time_ns'],
                   'interval_end_ns': host_after['time_ns']}
        raw_path.write_text(json.dumps(pending, indent=2) + '\n')
        try:
            history_projection, raw = HISTORY.validate(
                root, baseline_history, oracle, host_before['time_ns'], host_after['time_ns'],
                expected_transitions=len(PREPARE.HISTORY_REASONS[workload]))
        except (ValueError, OSError) as error:
            pending.update(validation_status='failed', error=str(error))
            raw_path.write_text(json.dumps(pending, indent=2) + '\n')
            raise
        raw_path.write_text(json.dumps(raw, indent=2) + '\n')
    if STATE.tree(stage / 'remote') != STATE.tree(Path(fixtures['remotes'][workload])):
        raise RuntimeError(f'{prefix}: switch mutated its immutable remote')
    workspace = IMPORT_STATE.import_state(root, baseline_objects, baseline_history, Path(fixtures['remotes'][workload]))
    workspace['bitmap_history'] = history_projection
    if workload in PREPARE.INSTALLATIONS:
        installation_clocks(root, workspace, prefix, host_before['time_ns'], host_after['time_ns'])
    verify_postconditions(root, workload)
    globals_state = STATE.tree(stage / 'globals', globals_directory=True)
    command_details_clock(stage / 'globals', globals_state, prefix, host_before['time_ns'], host_after['time_ns'], Path(fixtures['globals']))
    result = {'status': output.returncode, 'stdout': STATE.normalized(output.stdout),
              'stderr': STATE.normalized(output.stderr),
              'workspace': workspace,
              'globals': globals_state,
              'home': STATE.tree(stage / 'home'),
              'remote': STATE.tree(stage / 'remote')}
    prefix.with_suffix('.state.json').write_text(json.dumps(result, indent=2) + '\n')
    return elapsed, result


def bitmap(root):
    text = (root / '.bitmap').read_text()
    return json.loads(text[text.index('{'):])


def verify_postconditions(root, workload):
    mapping = bitmap(root)
    rows = {row['name']: row for row in mapping.values()
            if isinstance(row, dict) and 'rootDir' in row}
    expected = {'comp00', 'comp01'}
    if workload == 'empty-pattern':
        expected = {'comp00', 'comp02', 'comp04'}
    elif workload == 'workspace-only':
        expected = {'comp00', 'comp01'}
    elif workload == 'default-install':
        expected = {'comp00'}
    elif workload.startswith('merge-'):
        expected = {'comp1'}
    elif workload in PREPARE.PROVIDERS:
        expected = {'comp1', 'env/lane-adoption'}
    if set(rows) != expected:
        raise RuntimeError(f'{workload}: incorrect adopted inventory: {list(rows)}')
    expected_lane = 'lane-b' if workload.startswith('merge-') else 'dev'
    if mapping['_bit_lane']['id']['name'] != expected_lane:
        raise RuntimeError(f'{workload}: incorrect final lane')
    if workload.startswith('merge-'):
        content = (root / rows['comp1']['rootDir'] / 'index.js').read_text()
        if workload == 'merge-ours' and content != '// uncommitted local edit on lane-a\n':
            raise RuntimeError('ours did not preserve the real local edit')
        if workload == 'merge-theirs' and content != "module.exports='lane-b';\n":
            raise RuntimeError('theirs did not materialize the actual lane source')
        if workload == 'merge-manual' and not all(marker in content for marker in ['<<<<<<<', '=======', '>>>>>>>', 'uncommitted local edit', 'lane-b']):
            raise RuntimeError('manual strategy did not preserve both real conflict sides')
    if workload in PREPARE.INSTALLATIONS:
        if not (root / 'pnpm-lock.yaml').is_file() or not (root / 'node_modules/.modules.yaml').is_file():
            raise RuntimeError('default installation did not complete')
    if workload in PREPARE.PROVIDERS:
        provider_postconditions(root, workload)


def provider_postconditions(root, workload):
    rows = [json.loads(line) for line in (root / 'lane-adoption-phases.jsonl').read_text().splitlines()]
    for phase in ['onLoad', 'preInstall', 'postInstall', 'compile']:
        if not any(row['phase'] == phase for row in rows):
            raise RuntimeError(f'missing actual provider phase: {phase}')
    if any(row['consumerLane'] != 'main' or row['diskLane'] is not None for row in rows):
        raise RuntimeError('provider observed new lane before finalization')
    receipt = json.loads((root / 'lane-adoption-provider-receipt.json').read_text())
    if not Path(receipt['module']).as_posix().endswith('/dist/index.js'):
        raise RuntimeError('actual physically compiled provider did not run')
    if workload == 'mutable-install':
        events = [json.loads(line) for line in (root / 'lane-adoption-subscriber-receipts.jsonl').read_text().splitlines()]
        if len(events) != 1 or not all(events[0][field] is True for field in ['sameInstaller', 'sameArgs', 'sameOptions', 'reassignedOptional']):
            raise RuntimeError('subscriber argument/receiver identity differs')
        if any(events[0][field] is not False for field in ['samePackageOptions', 'originalOptional']):
            raise RuntimeError('subscriber original/reassigned PM references differ')
        package = root / 'node_modules/@fixture/subscriber-linked'
        if (package / 'index.js').read_bytes() != (root / 'subscriber-linked/index.js').read_bytes():
            raise RuntimeError('subscriber-created link missing or wrong')
        modules = json.loads((root / 'node_modules/.modules.yaml').read_bytes())
        if modules['included']['optionalDependencies'] is not False:
            raise RuntimeError('original subscriber PM option was ignored')
        if (root / 'subscriber-ignored-root').exists():
            raise RuntimeError('reassigned args root incorrectly changed formal install root')


def command_details_clock(globalsdir, tree, prefix, hostbefore_ns, hostafter_ns, baselineglobals):
    """Project only a canonical, command-window-validated last-command timestamp."""
    name = 'last-command-details/meta.json'
    path = globalsdir / name
    if path.is_symlink() or path.parent.is_symlink():
        raise RuntimeError('nonregular last-command metadata')
    if not path.exists():
        return
    if not path.is_file():
        raise RuntimeError('nonregular last-command metadata')
    raw = path.read_bytes()
    mode = path.stat().st_mode & 0o7777
    if tree.get(name) != ['file', mode, STATE.sha(raw)]:
        raise RuntimeError('last-command metadata was otherwise projected')
    baseline = baselineglobals / name
    if baseline.is_symlink() or baseline.parent.is_symlink() or (baseline.exists() and not baseline.is_file()):
        raise RuntimeError('nonregular immutable baseline command metadata')
    baseline_raw = baseline.read_bytes() if baseline.exists() else None
    if raw == baseline_raw:
        prefix.with_suffix('.command-details-clock.json').write_text(json.dumps({
            'path': name, 'bytes_base64': base64.b64encode(raw).decode(), 'mode': mode,
            'baseline_sha256': STATE.sha(baseline_raw), 'projection': 'none: immutable baseline bytes unchanged',
            'interval_start_ns': hostbefore_ns, 'interval_end_ns': hostafter_ns,
            'projected_sha256': STATE.sha(raw)}, indent=2) + '\n')
        return
    value = json.loads(raw)
    if not isinstance(value, dict) or set(value) != {'command', 'timestamp'} or value['command'] != 'switch':
        raise RuntimeError('unknown last-command metadata schema')
    timestamp = value['timestamp']
    if not isinstance(timestamp, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z', timestamp):
        raise RuntimeError('noncanonical last-command timestamp')
    parsed = datetime.datetime.strptime(timestamp, '%Y-%m-%dT%H:%M:%S.%fZ').replace(tzinfo=datetime.timezone.utc)
    delta = parsed - datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)
    millis = (delta.days * 86400 + delta.seconds) * 1000 + delta.microseconds // 1000
    if not hostbefore_ns // 1_000_000 <= millis <= hostafter_ns // 1_000_000:
        raise RuntimeError('last-command timestamp outside observed command interval')
    canonical = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
    token = b'"timestamp":' + json.dumps(timestamp).encode()
    if raw != canonical or raw.count(token) != 1:
        raise RuntimeError('last-command metadata is not compact canonical JSON with one timestamp token')
    begin = raw.index(token) + len(b'"timestamp":')
    end = begin + len(json.dumps(timestamp).encode())
    projected = raw[:begin] + b'"<command-timestamp>"' + raw[end:]
    tree[name] = ['file', mode, STATE.sha(projected)]
    prefix.with_suffix('.command-details-clock.json').write_text(json.dumps({
        'path': name, 'bytes_base64': base64.b64encode(raw).decode(), 'mode': mode,
        'baseline_sha256': STATE.sha(baseline_raw) if baseline_raw is not None else None,
        'projection': 'only fresh command-window timestamp scalar',
        'timestamp': timestamp, 'interval_start_ns': hostbefore_ns, 'interval_end_ns': hostafter_ns,
        'timestamp_precision': 'UTC milliseconds; observed interval endpoints compared at the same precision',
        'projected_sha256': STATE.sha(projected)}, indent=2) + '\n')


def installation_clocks(root, state, prefix, started, ended):
    """Validate and replace only the two established pnpm wall-clock scalar tokens."""
    proof = {}
    for name, field in [('node_modules/.modules.yaml', 'prunedAt'),
                        ('node_modules/.pnpm-workspace-state-v1.json', 'lastValidatedTimestamp')]:
        path = root / name
        if path.is_symlink() or not path.is_file():
            raise RuntimeError(f'nonregular install metadata: {path}')
        raw = path.read_bytes()
        value = json.loads(raw)
        if field == 'prunedAt':
            if value['layoutVersion'] != 5 or value['nodeLinker'] != 'isolated' or not value['packageManager'].startswith('pnpm@') or ('injectedDeps' in value and not isinstance(value['injectedDeps'], dict)) or not isinstance(value['included'], dict):
                raise RuntimeError('unknown pnpm modules metadata schema')
            parsed = email.utils.parsedate_to_datetime(value[field])
            if email.utils.format_datetime(parsed, usegmt=True) != value[field]:
                raise RuntimeError('noncanonical pnpm pruning timestamp')
            timestamp = int(parsed.timestamp()) * 1_000_000_000
            valid = started // 1_000_000_000 * 1_000_000_000 <= timestamp <= ended
            replacement = b'"<prunedAt>"'
        else:
            if not isinstance(value['projects'], dict) or not isinstance(value['pnpmfiles'], list) or value['settings']['nodeLinker'] != 'isolated' or type(value[field]) is not int:
                raise RuntimeError('unknown pnpm workspace-state metadata schema')
            timestamp = value[field] * 1_000_000
            valid = started // 1_000_000 <= value[field] <= ended // 1_000_000
            replacement = b'0'
        if not valid:
            raise RuntimeError(f'pnpm clock outside observed command interval: {name}')
        token_prefix = f'\n  "{field}": '.encode()
        if raw.count(token_prefix) != 1:
            raise RuntimeError('pnpm clock root token is not unique/canonical')
        begin = raw.index(token_prefix) + len(token_prefix)
        token = json.dumps(value[field], ensure_ascii=False, separators=(',', ':')).encode()
        end = begin + len(token)
        if raw[begin:end] != token or raw[end:end + 2] != b',\n':
            raise RuntimeError('pnpm clock token delimiter differs')
        projected = raw[:begin] + replacement + raw[end:]
        entry = state['tree'][name]
        if entry != ['file', path.stat().st_mode & 0o7777, STATE.sha(raw)]:
            raise RuntimeError('install metadata was otherwise projected')
        state['tree'][name] = ['file', entry[1], STATE.sha(projected)]
        proof[name] = {'bytes_base64': base64.b64encode(raw).decode(), 'mode': entry[1],
                       'clock': value[field], 'projected_sha256': STATE.sha(projected)}
    prefix.with_suffix('.install-clocks.json').write_text(json.dumps({
        'interval_start_ns': started, 'interval_end_ns': ended, 'files': proof}, indent=2) + '\n')


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
    stage = args.stage.resolve() if args.stage else Path(tempfile.mkdtemp(prefix='lane-adoption-bench-'))
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
        raise RuntimeError('requires a fresh lane file-remote fixture stage')
    warm = stage / 'builtin-warmup'
    warm.mkdir(exist_ok=True)
    if not (warm / 'clean').exists():
        shutil.copytree(fixtures['workloads']['merge-ours'], warm / 'clean', symlinks=True)
        with (warm / 'clean/comp1/index.js').open('a') as source_file:
            source_file.write("\nrequire('node:path');\n")
    fixtures['builtin_warmup_fixture'] = {
        'path': str(warm / 'clean'), 'sha256': COMMON.fingerprint(warm / 'clean'),
        'method': 'Disposable copy of conflict input with one node:path import; no measured baseline changed.'}
    fixtures['builtin_facts_prewarming'] = COMMON.PREPARE.prewarm_builtin_facts(
        args, warm, fixtures, COMMON.environment(args, stage, 'timed'))
    manifest.write_text(json.dumps(fixtures, indent=2) + '\n')
    if args.prepare_only:
        fixtures['lane_bitmap_history_oracles'] = HISTORY_PREPARE.prepare(
            args, stage, fixtures, COMMON.environment(args, stage, 'timed'))
        manifest.write_text(json.dumps(fixtures, indent=2) + '\n')
        print(manifest)
        return
    for workload in args.workload or list(PREPARE.WORKLOADS):
        if workload in HISTORY_PREPARE.WORKLOADS:
            HISTORY_PREPARE.frozen(fixtures, workload)
    source = Path(__file__).resolve().parents[2]
    source_before = COMMON.native_source(source)
    fixture_before = {key: COMMON.fingerprint(Path(value)) for key, value in fixtures['workloads'].items()}
    common_before = {key: COMMON.fingerprint(Path(fixtures[key])) for key in ['home', 'globals']}
    remote_before = {key: COMMON.fingerprint(Path(value)) for key, value in fixtures['remotes'].items()}
    helpers = ['bench-lane-adoption.py', 'prepare-lane-adoption-benchmark.py', 'prepare-stash-benchmark.py',
               'bench-stash.py', 'stash-benchmark-state.py',
               'prepare-lane-bitmap-history-oracle.py', 'prepare-bitmap-history-oracle.py',
               'scope-bitmap-history-oracle.cjs', 'bitmap-history-oracle.py',
               'bench-import-adoption.py']
    helper_before = {key: COMMON.sha(Path(__file__).with_name(key)) for key in helpers}
    oracle_before = {key: COMMON.sha(Path(value['path']))
                     for key, value in fixtures.get('lane_bitmap_history_oracles', {}).items()}
    provider_path = source / 'native/cli/tests/e2e/harmony/lane_adoption/callbacks.cjs'
    provider_before = COMMON.sha(provider_path)
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
    for key, before in oracle_before.items():
        if COMMON.sha(Path(fixtures['lane_bitmap_history_oracles'][key]['path'])) != before:
            raise RuntimeError(f'frozen lane bitmap oracle changed during measurement: {key}')
    if COMMON.sha(provider_path) != provider_before:
        raise RuntimeError('provider fixture source changed during qualification')
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
              'provider_fixture_sha256': provider_before, 'helper_sha256': helper_before, 'bitmap_history_oracle_sha256': oracle_before,
              'normalization': ['native trace', 'completed-in durations',
                                'validated command-history ISO timestamps/PIDs',
                                'config histories retain strict snapshots/reasons',
                                'lane bitmap histories: every surviving raw backup validated against independent last-writer preimages; overwritten preimages remain oracle-only',
                                'checksum-validated cache-index receipt timestamps',
                                'last-command-details/meta.json: immutable baseline bytes unchanged; otherwise only compact canonical fresh switch timestamp inside observed command window'],
              'intentional_boundaries': ['missing published switch JSON handler', 'configured active-lane import delegation', 'Git branch management'],
              'excluded_implementation_state': ['exact workspace-root debug.log', 'exact globals/logs subtree'],
              'ownership_note': 'Every measured command must remain native in all three presentation modes.',
              'native_pairs': sum(row['native_ownership'] for row in verified),
              'warmup_note': 'Pinned builtin metadata is prewarmed; untimed installation transcript preparation may also warm the package store. No first-use claim.',
              'clock_phase_control': {
                  'workloads': list(PREPARE.WORKLOADS),
                  'start_phase_ms': [50, 100],
                  'outside_command_timing': True,
                  'method': 'Wait before launch for the same wall-clock phase on both implementations; clocks and commands are unchanged.',
                  'reason': 'Prelaunch phase remains unchanged; two-write lane clock groups are independently validated rather than assumed equal.',
                  'lane_oracle_raw_proofs': str(stage / 'evidence/*.bitmap-history.json')},
              'verified_pairs': len(verified), 'verified': verified, 'workloads': measurements}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
