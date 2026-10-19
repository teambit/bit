#!/usr/bin/env python3
"""Compare complete lane-history restoration commands with exact output and complete filesystem state.

Fixture creation is outside measurements. Existing qualified stash harness helpers
supply path-identical restoration, native-source fingerprints, presentation modes,
full object/state validation and narrowly validated history/cache timestamps.
"""
import argparse
import base64
import datetime
import email.utils
import hashlib
import json
import platform
import re
import os
import shlex
import statistics
import stat
import subprocess
import shutil
import tempfile
import time
from pathlib import Path
import importlib.util
import sys
import zlib
sys.dont_write_bytecode = True


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


COMMON = load('lane_common', 'bench-stash.py')
PREPARE = load('lane_prepare', 'prepare-lane-restoration-benchmark.py')
STATE = COMMON.STATE
HISTORY = load('lane_bitmap_validator', 'bitmap-history-oracle.py')
HISTORY_PREPARE = load('lane_bitmap_prepare', 'prepare-lane-restoration-history-oracle.py')
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


def validate_revert_json(stdout, history_id):
    """PTYs merge native diagnostics into stdout; retain the existing exact-output projection."""
    value = json.loads(STATE.normalized(stdout))
    if value.get('historyId') != history_id or value.get('mergeSnapResults', 'missing') is not None:
        raise RuntimeError('actual revert JSON result differs from released schema')


def native_ownership(workload, mode):
    """Only the two CI error cases require the published V8 diagnostic stack."""
    return not (mode == 'ci' and workload in PREPARE.ERRORS)


def history_baseline(root, baseline_objects, remote, workload, history_id):
    """Validate the single missing remote entry in released LaneHistory.merge's local-first order."""
    if workload != 'remote-history-refresh':
        return baseline_objects
    lane = bitmap(root)['_bit_lane']['id']
    index = json.loads((STATE.scope(root) / 'index.json').read_text())
    matches = [row['hash'] for row in index['lanes'] if row['id'] == lane]
    if len(matches) != 1:
        raise RuntimeError('history refresh requires one indexed active lane')
    reference = hashlib.sha1(f'{matches[0]}:LaneHistory'.encode()).hexdigest()
    original = baseline_objects.get(reference)
    if original is None or original[0] != 'LaneHistory':
        raise RuntimeError('history refresh requires the existing active LaneHistory')
    path = remote / 'objects' / reference[:2] / reference[2:]
    raw = zlib.decompress(path.read_bytes())
    header, separator, body = raw.partition(b'\0')
    length = len(body.decode('utf-8').encode('utf-16-le')) // 2
    if not separator or header != f'LaneHistory {reference} {length}'.encode():
        raise RuntimeError('history refresh remote identity/length differs')
    value = json.loads(body)
    if (value.get('laneHash') != matches[0] or value.get('scope') != lane['scope']
            or value.get('name') != lane['name'] or history_id not in value['history']):
        raise RuntimeError('history refresh remote lane or requested entry differs')
    entry = value['history'].pop(history_id)
    expected = json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()
    if original[1] != expected:
        raise RuntimeError('history refresh baseline differs beyond the single missing entry')
    value['history'][history_id] = entry
    merged = json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()
    validated = dict(baseline_objects)
    validated[reference] = ('LaneHistory', merged, original[2], original[3])
    return validated


def raw_history(root):
    """Capture exact zero-write state, including metadata absent on a fresh main lane."""
    scope = root / '.bit'
    metadata = scope / 'bitmap-history-metadata.txt'
    directory = scope / 'bitmap-history'
    return {
        'metadata_base64': base64.b64encode(metadata.read_bytes()).decode() if metadata.exists() else None,
        'metadata_mode': stat.S_IMODE(metadata.stat().st_mode) if metadata.exists() else None,
        'directory_mode': stat.S_IMODE(directory.stat().st_mode) if directory.exists() else None,
        'backups': {path.name: {'bytes_base64': base64.b64encode(path.read_bytes()).decode(),
                              'mode': stat.S_IMODE(path.stat().st_mode)}
                    for path in sorted(directory.iterdir())} if directory.exists() else None,
    }


def execute(args, stage, fixtures, workload, mode, run, implementation):
    for source, name in [(fixtures['workloads'][workload], 'workspace'),
                         (fixtures['home'], 'home'), (fixtures['globals'], 'globals'),
                         (fixtures['remotes'][workload], 'remote')]:
        COMMON.restore(Path(source), stage / name)
    root = stage / 'workspace'
    baseline_objects, baseline_history = STATE.objects(root), STATE.bitmap_history(root)
    baseline_raw_history = raw_history(root)
    binary = args.node_binary if implementation == 'node' else args.rust
    before = COMMON.sha(binary)
    command = fixtures['commands'][workload]
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
    if output.returncode != PREPARE.EXPECTED_CODES[workload]:
        raise RuntimeError(f'{workload}/{mode}/{run}/{implementation} failed; evidence {prefix}')
    if workload in PREPARE.ERRORS:
        required = b'while on main' if workload == 'main-history' else b'unable to find history'
        if required not in output.stdout + output.stderr:
            raise RuntimeError(f'{prefix}: failed before the intended history error')
    if workload in PREPARE.INSTALLATIONS and any(
            title in output.stdout + output.stderr for title in [b'Installation Error', b'Compilation Error']):
        raise RuntimeError(f'{prefix}: graceful tooling failure does not qualify successful installation')
    trace = output.stdout + output.stderr
    if implementation == 'rust':
        marker = f'running `{command[0]}` natively'.encode()
        if native_ownership(workload, mode):
            if marker not in trace or b'declined' in trace or b'delegating:' in trace:
                raise RuntimeError(f'{prefix}: command did not remain native')
        elif (b'delegating:' not in trace
              or b'CI lane history diagnostics require the published stack' not in trace):
            raise RuntimeError(f'{prefix}: expected pre-effect CI diagnostic delegation')
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
    if workload not in HISTORY_PREPARE.WORKLOADS:
        raw = raw_history(root)
        prefix.with_suffix('.bitmap-history.json').write_text(json.dumps({
            'expected_writes': 0, 'baseline': baseline_raw_history, 'actual': raw}, indent=2) + '\n')
        if raw != baseline_raw_history:
            raise RuntimeError(f'{prefix}: zero-write historical operation changed raw bitmap history')
    if STATE.tree(stage / 'remote') != STATE.tree(Path(fixtures['remotes'][workload])):
        raise RuntimeError(f'{prefix}: historical command mutated its immutable remote')
    remote = Path(fixtures['remotes'][workload])
    expected_objects = history_baseline(root, baseline_objects, remote, workload, command[2])
    workspace = IMPORT_STATE.import_state(root, expected_objects, baseline_history, remote)
    if history_projection is not None:
        workspace['bitmap_history'] = history_projection
    if workload in PREPARE.INSTALLATIONS:
        installation_clocks(root, workspace, prefix, host_before['time_ns'], host_after['time_ns'])
    verify_postconditions(root, workload, fixtures)
    if workload == 'restore-json':
        validate_revert_json(output.stdout, command[2])
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


def verify_postconditions(root, workload, fixtures):
    mapping = bitmap(root)
    rows = {row['name']: row for row in mapping.values()
            if isinstance(row, dict) and 'rootDir' in row}
    contract = fixtures['contracts'].get(workload, {})
    if workload in PREPARE.ERRORS:
        baseline = Path(fixtures['workloads'][workload])
        if (root / '.bitmap').read_bytes() != (baseline / '.bitmap').read_bytes():
            raise RuntimeError(f'{workload}: error changed bitmap')
        return
    if mapping['_bit_lane']['id']['name'] != 'dev':
        raise RuntimeError(f'{workload}: historical operation switched lanes')
    if workload == 'provider-default-install':
        if rows['comp1']['version'] != contract['current_versions']['comp1']:
            raise RuntimeError('provider revert changed current version')
        if (root / rows['comp1']['rootDir'] / rows['comp1']['mainFile']).read_bytes() != b"module.exports='switched lane body';\n":
            raise RuntimeError('provider revert failed to restore historical source')
        text = (root / 'lane-adoption-phases.jsonl').read_text()
        phases = [json.loads(line)['phase'] for line in text.splitlines()]
        positions = [phases.index(phase) for phase in ['onLoad', 'preInstall', 'postInstall', 'compile']]
        if positions != sorted(positions):
            raise RuntimeError('actual provider installation/compiler phases out of order')
        for name in ['pnpm-lock.yaml', 'node_modules/.modules.yaml']:
            if not (root / name).is_file():
                raise RuntimeError(f'actual installation missing {name}')
        return
    expected = {'comp3'} if workload == 'revert-existing' else {'comp1', 'comp2', 'comp3'}
    if set(rows) != expected:
        raise RuntimeError(f'{workload}: incorrect restored inventory {list(rows)}')
    for name, row in rows.items():
        if not (root / row['rootDir'] / row['mainFile']).is_file():
            raise RuntimeError(f'{workload}: missing actual bitmap main file for {name}')
    if workload == 'remote-history-refresh':
        expected_bytes = contract['expected_comp3'].encode()
    else:
        expected_bytes = b"module.exports='comp3 main';\n"
        source = 'original_versions' if workload == 'checkout-deleted' else 'current_versions'
        if rows['comp3']['version'] != contract[source]['comp3']:
            raise RuntimeError(f'{workload}: wrong surviving component version')
        if workload in {'checkout-deleted', 'restore-deleted', 'restore-json'}:
            for name in ['comp1', 'comp2']:
                if rows[name]['version'] != contract['original_versions'][name]:
                    raise RuntimeError(f'{workload}: restored wrong historical version')
    if (root / rows['comp3']['rootDir'] / rows['comp3']['mainFile']).read_bytes() != expected_bytes:
        raise RuntimeError(f'{workload}: historical contents not materialized')


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
    raise RuntimeError('lane subcommand unexpectedly replaced immutable last-command metadata')


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
    stage = args.stage.resolve() if args.stage else Path(tempfile.mkdtemp(prefix='lane-restoration-bench-'))
    stage.mkdir(parents=True, exist_ok=True)
    (stage / 'evidence').mkdir(exist_ok=True)
    node_version = subprocess.check_output([str(args.node_binary), '--version'], text=True).strip()
    cli_package = args.node_cli.parent.parent / 'package.json'
    bit_version = json.loads(cli_package.read_text())['version']
    if node_version != 'v22.22.0' or bit_version != '2.2.94':
        raise RuntimeError('benchmark requires pinned Node22.22.0 / Bit2.2.94')
    manifest = stage / 'fixtures.json'
    if not manifest.exists():
        if not args.prepare_only:
            raise RuntimeError('missing immutable fixtures; run explicit --prepare-only first')
        baselines, remotes, home, globals_directory = PREPARE.seed(args, stage, COMMON.environment(args, stage, 'timed'))
        manifest.write_text(json.dumps({'workloads': {key: str(value) for key, value in baselines.items()},
                                       'home': str(home), 'globals': str(globals_directory),
                                       'remotes': {key: str(value) for key, value in remotes.items()},
                                       'remote_path': str(stage / 'remote')}, indent=2) + '\n')
    fixtures = json.loads(manifest.read_text())
    contracts = json.loads((stage / 'restoration-contracts.json').read_text())
    fixtures.update(contracts)
    if 'remotes' not in fixtures or fixtures.get('remote_path') != str(stage / 'remote'):
        raise RuntimeError('requires a fresh lane file-remote fixture stage')
    if args.prepare_only:
        warm = stage / 'builtin-warmup'
        warm.mkdir(exist_ok=True)
        if not (warm / 'clean').exists():
            shutil.copytree(fixtures['workloads']['checkout-deleted'], warm / 'clean', symlinks=True)
            with (warm / 'clean/comp3/index.js').open('a') as source_file:
                source_file.write("\nrequire('node:path');\n")
        fixtures['builtin_warmup_fixture'] = {
            'path': str(warm / 'clean'), 'sha256': COMMON.fingerprint(warm / 'clean'),
            'method': 'Disposable copy of deleted-lane input with one node:path import; no measured baseline changed.'}
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
    manifest_before = COMMON.sha(manifest)
    contracts_before = COMMON.sha(stage / 'restoration-contracts.json')
    fixture_before = {key: COMMON.fingerprint(Path(value)) for key, value in fixtures['workloads'].items()}
    common_before = {key: COMMON.fingerprint(Path(fixtures[key])) for key in ['home', 'globals']}
    remote_before = {key: COMMON.fingerprint(Path(value)) for key, value in fixtures['remotes'].items()}
    helpers = ['bench-lane-restoration.py', 'prepare-lane-restoration-benchmark.py', 'prepare-stash-benchmark.py',
               'bench-stash.py', 'stash-benchmark-state.py',
               'prepare-lane-restoration-history-oracle.py', 'prepare-bitmap-history-oracle.py',
               'scope-bitmap-history-oracle.cjs', 'bitmap-history-oracle.py',
               'bench-import-adoption.py', 'prepare-lane-adoption-benchmark.py']
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
                                 'native_ownership': native_ownership(workload, mode), 'expected_nonzero': workload in PREPARE.ERRORS, 'expected_exit_code': PREPARE.EXPECTED_CODES[workload], 'exit_code': pair['rust']['status']})
            measurements[workload][mode] = {'native_ownership': native_ownership(workload, mode),
                'speed_claim_eligible': False, 'runs_ms': samples,
                'median_ms': {key: statistics.median(value) for key, value in samples.items()}}
            print(f'verified {workload} {mode}: {measurements[workload][mode]["median_ms"]}',
                  file=sys.stderr, flush=True)
    if COMMON.sha(manifest) != manifest_before or COMMON.sha(stage / 'restoration-contracts.json') != contracts_before:
        raise RuntimeError('fixture commands/contracts changed during measurement')
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
              'fixture_manifest_sha256': manifest_before, 'contracts_sha256': contracts_before, 'common_fixture_sha256': common_before, 'remote_fixture_sha256': remote_before,
              'host_monitor': monitor, 'host_command_samples': str(stage / 'evidence/*.host.json'),
              'reproduce': [sys.executable, *sys.argv],
              'provider_fixture_sha256': provider_before, 'helper_sha256': helper_before, 'bitmap_history_oracle_sha256': oracle_before,
              'normalization': ['expected nonzero errors retain exact output, code, ownership and state', 'native trace', 'completed-in durations',
                                'validated command-history ISO timestamps/PIDs',
                                'config histories retain strict snapshots/reasons',
                                'lane bitmap histories: every surviving raw backup validated against independent last-writer preimages; overwritten preimages remain oracle-only',
                                'checksum-validated cache-index receipt timestamps',
                                'last-command-details/meta.json must remain byte-exact to immutable baseline for lane subcommands'],
              'intentional_boundaries': ['lane checkout has no JSON option; genuine lane revert JSON is included', 'two CI errors deliberately delegate before effects to retain the exact published V8 stack; their ten pairs are excluded from native speed claims', 'unsupported transports/provider inputs remain explicit command boundaries'],
              'excluded_implementation_state': ['exact workspace-root debug.log', 'exact globals/logs subtree'],
              'ownership_note': 'All successful modes and ordinary/TTY errors remain native. The two CI error modes must explicitly delegate before effects; their timings never qualify native speed.',
              'native_pairs': sum(row['native_ownership'] for row in verified),
              'warmup_note': 'Pinned builtin metadata is prewarmed; untimed installation transcript preparation may also warm the package store. No first-use claim.',
              'clock_phase_control': {
                  'workloads': list(PREPARE.WORKLOADS),
                  'start_phase_ms': [50, 100],
                  'outside_command_timing': True,
                  'method': 'Wait before launch for the same wall-clock phase on both implementations; clocks and commands are unchanged.',
                  'reason': 'Prelaunch phase remains unchanged; every actual historical checkout backup is independently validated.',
                  'lane_oracle_raw_proofs': str(stage / 'evidence/*.bitmap-history.json')},
              'verified_pairs': len(verified), 'verified': verified, 'workloads': measurements}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
