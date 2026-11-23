#!/usr/bin/env python3
"""Qualify whole graph-reset commands against pinned Node on identical restored paths.

Preparation and independent bitmap-write capture are untimed. Timings remain
ineligible for speed claims until a separate closed host monitor qualifies them.
"""
import argparse
import base64
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import shlex
import shutil
import stat
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


REST = load('graph_reset_restoration', 'bench-lane-restoration.py')
COMMON, STATE, HISTORY = REST.COMMON, REST.STATE, REST.HISTORY
PREPARE = load('graph_reset_prepare', 'prepare-lane-graph-reset-benchmark.py')
ORACLE = load('graph_reset_oracle', 'prepare-lane-graph-reset-history-oracle.py')
MUTABLE_OBJECTS = {'Component', 'Lane', 'VersionHistory', 'LaneHistory'}
CI_REASON = b'CI lane reset diagnostics require the published stack'


def fingerprint(root):
    """Immutable recipe identity includes root, directories, modes and symlink targets."""
    root = Path(root)
    digest = hashlib.sha256()
    for path in [root, *sorted(root.rglob('*'))]:
        mode = path.lstat().st_mode
        if path.is_symlink():
            data = b'link\0' + os.fsencode(os.readlink(path))
        elif stat.S_ISDIR(mode):
            data = b'directory'
        elif stat.S_ISREG(mode):
            data = b'file\0' + path.read_bytes()
        else:
            raise RuntimeError(f'unsupported fixture entry: {path}')
        digest.update(os.fsencode(path.relative_to(root).as_posix()) + b'\0'
                      + str(stat.S_IMODE(mode)).encode() + b'\0' + data + b'\0')
    return digest.hexdigest()


def strict_objects(root):
    directory = STATE.scope(root) / 'objects'
    if directory.is_symlink() or not directory.is_dir():
        raise RuntimeError('nonregular object root')
    for prefix in directory.iterdir():
        if prefix.is_symlink() or not prefix.is_dir() or not re.fullmatch('[0-9a-f]{2}', prefix.name):
            raise RuntimeError(f'invalid object prefix: {prefix}')
        for path in prefix.iterdir():
            if path.is_symlink() or not path.is_file() or not re.fullmatch('[0-9a-f]{38}', path.name):
                raise RuntimeError(f'invalid object entry: {path}')
    return STATE.objects(root)


def raw_history(root):
    scope = STATE.scope(root)
    directory, metadata = scope / 'bitmap-history', scope / 'bitmap-history-metadata.txt'
    for path in [directory, metadata]:
        if path.is_symlink() or (path.exists() and not (path.is_dir() if path == directory else path.is_file())):
            raise RuntimeError(f'nonregular bitmap history: {path}')
    backups = None
    if directory.exists():
        backups = {}
        for path in sorted(directory.iterdir()):
            if path.is_symlink() or not path.is_file():
                raise RuntimeError(f'nonregular bitmap backup: {path}')
            backups[path.name] = {'bytes_base64': base64.b64encode(path.read_bytes()).decode(),
                                  'mode': stat.S_IMODE(path.stat().st_mode)}
    return {'metadata_base64': base64.b64encode(metadata.read_bytes()).decode() if metadata.exists() else None,
            'metadata_mode': stat.S_IMODE(metadata.stat().st_mode) if metadata.exists() else None,
            'directory_mode': stat.S_IMODE(directory.stat().st_mode) if directory.exists() else None,
            'backups': backups}


def workspace_state(root, baseline, history, projection, remote):
    found = strict_objects(root)
    directory = STATE.scope(root) / 'objects'
    immutable = {}
    for reference, original in baseline.items():
        current = found.get(reference)
        if current is None and original[0] != 'Component':
            raise RuntimeError(f'reset removed a non-Component object: {reference}')
        if current is not None and current[0] != original[0]:
            raise RuntimeError(f'reset changed an object kind: {reference}')
        if original[0] not in MUTABLE_OBJECTS:
            immutable[reference] = original
    for reference, current in found.items():
        if reference not in baseline and current[0] in {'Version', 'Source'}:
            path = remote / 'objects' / reference[:2] / reference[2:]
            local = directory / reference[:2] / reference[2:]
            if path.is_symlink() or not path.is_file() or local.read_bytes() != path.read_bytes():
                raise RuntimeError(f'new immutable object does not match the actual remote: {reference}')
            immutable[reference] = current
    return STATE.state(root, immutable, history, history_projection=projection)


def command_clock(directory, tree, prefix, started, ended, baseline):
    """The established command metadata projection, restricted to actual reset timestamps."""
    name = 'last-command-details/meta.json'
    path, previous = directory / name, baseline / name
    for candidate in [path, previous]:
        if candidate.is_symlink() or candidate.parent.is_symlink() or (candidate.exists() and not candidate.is_file()):
            raise RuntimeError('nonregular last-command metadata')
    if not path.exists():
        return
    raw = path.read_bytes()
    mode = stat.S_IMODE(path.stat().st_mode)
    if tree.get(name) != ['file', mode, STATE.sha(raw)]:
        raise RuntimeError('last-command metadata was otherwise projected')
    proof = {'bytes_base64': base64.b64encode(raw).decode(), 'mode': mode,
             'interval_start_ns': started, 'interval_end_ns': ended, 'projection': 'unchanged'}
    if not previous.exists() or raw != previous.read_bytes():
        value = json.loads(raw)
        if set(value) != {'command', 'timestamp'} or value['command'] != 'reset':
            raise RuntimeError('unknown reset command metadata schema')
        stamp = value['timestamp']
        if not isinstance(stamp, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z', stamp):
            raise RuntimeError('noncanonical reset command timestamp')
        parsed = datetime.datetime.strptime(stamp, '%Y-%m-%dT%H:%M:%S.%fZ').replace(tzinfo=datetime.timezone.utc)
        delta = parsed - datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)
        millis = (delta.days * 86400 + delta.seconds) * 1000 + delta.microseconds // 1000
        if not started // 1_000_000 <= millis <= ended // 1_000_000:
            raise RuntimeError('reset command timestamp outside observed interval')
        token = b'"timestamp":' + json.dumps(stamp).encode()
        if raw != json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode() or raw.count(token) != 1:
            raise RuntimeError('noncanonical reset command metadata bytes')
        begin = raw.index(token) + len(b'"timestamp":')
        projected = raw[:begin] + b'"<command-timestamp>"' + raw[begin + len(json.dumps(stamp).encode()):]
        tree[name] = ['file', mode, STATE.sha(projected)]
        proof.update(projection='validated reset timestamp only', projected_sha256=STATE.sha(projected))
    prefix.with_suffix('.command-details-clock.json').write_text(json.dumps(proof, indent=2) + '\n')


def ownership(workload, mode):
    return mode != 'ci' or PREPARE.CI_NATIVE[workload]


def validate_ownership(trace, workload, mode):
    if ownership(workload, mode):
        if b'running `reset` natively' not in trace or b'declined' in trace or b'delegating:' in trace:
            raise RuntimeError('reset did not remain native')
    elif (b'delegating:' not in trace or not re.search(
            rb'(?m)^bit-native: `reset` declined: ' + re.escape(CI_REASON) + rb'\r?$', trace)):
        raise RuntimeError('wrong pre-effect CI delegation boundary')


def replay_inputs(fixtures, workload):
    paths = fixtures['workload_environment'][workload]
    return {'workspace': Path(fixtures['workloads'][workload]), 'home': Path(paths['home']),
            'globals': Path(paths['globals']), 'remote': Path(fixtures['remotes'][workload])}


def validate_immutable_bytes(root, preimages):
    for reference, data in preimages.items():
        path = STATE.scope(root) / 'objects' / reference[:2] / reference[2:]
        if path.read_bytes() != data:
            raise RuntimeError(f'reset changed immutable compressed Version/Source bytes: {reference}')


def validate_error_history(root, baseline, raw, oracle):
    if raw_history(root) != raw or (root / '.bitmap').read_bytes() != (baseline / '.bitmap').read_bytes():
        raise RuntimeError('failed reset wrote bitmap/history')
    if ORACLE.raw_history(root) != oracle['baseline_raw_history']:
        raise RuntimeError('failed reset differs from the frozen zero-write oracle')


def postconditions(root, baseline, contract, objects):
    mapping = REST.bitmap(root)
    lane = mapping['_bit_lane']['id']
    if f"{lane['scope']}/{lane['name']}" != contract['expected_lane']:
        raise RuntimeError('reset switched the active lane')
    rows = {row['name']: row for row in mapping.values() if isinstance(row, dict) and 'rootDir' in row}
    for name, version in contract.get('expected_versions', {}).items():
        if rows[name]['version'] != version:
            raise RuntimeError(f'reset bitmap version differs: {name}')
    lanes = [json.loads(body) for kind, body, *_ in objects.values() if kind == 'Lane']
    selected = [value for value in lanes if f"{value.get('scope')}/{value.get('name')}" == contract['expected_lane']]
    if len(selected) != 1:
        raise RuntimeError('reset active Lane object is missing or ambiguous')
    heads = {row['id']['name']: row['head'] for row in selected[0]['components']}
    if contract['expected_code']:
        original = [json.loads(body) for kind, body, *_ in strict_objects(baseline).values() if kind == 'Lane']
        original = [row for row in original if f"{row.get('scope')}/{row.get('name')}" == contract['expected_lane']]
        if original != selected:
            raise RuntimeError('failed reset changed the active Lane object')
    else:
        expected = contract.get('remaining_lane_heads', contract.get('expected_lane_heads', {}))
        if expected and heads != expected:
            raise RuntimeError('reset lane membership/heads differ from the prepared contract')
        for field in ['expected_head', 'unchanged_head']:
            if field in contract and heads.get('comp1') != contract[field]:
                raise RuntimeError(f'reset lane head differs: {field}')
    for name in contract['unchanged_source_paths']:
        path, original = root / name, baseline / name
        if path.is_symlink() or original.is_symlink() or path.read_bytes() != original.read_bytes() or stat.S_IMODE(path.stat().st_mode) != stat.S_IMODE(original.stat().st_mode):
            raise RuntimeError(f'reset changed working source bytes/mode: {name}')


def execute(args, stage, fixtures, workload, mode, run, implementation):
    environment_paths = fixtures['workload_environment'][workload]
    for name, source in replay_inputs(fixtures, workload).items():
        COMMON.restore(source, stage / name)
    root = stage / 'workspace'
    baseline = Path(fixtures['workloads'][workload])
    objects, history, raw = strict_objects(root), STATE.bitmap_history(root), raw_history(root)
    immutable_raw = {key: (STATE.scope(root) / 'objects' / key[:2] / key[2:]).read_bytes()
                     for key, value in objects.items() if value[0] in {'Version', 'Source'}}
    binary = args.node_binary if implementation == 'node' else args.rust
    binary_before = COMMON.sha(binary)
    command = fixtures['commands'][workload]
    argv = ([str(binary), str(args.node_cli)] if implementation == 'node' else [str(binary)]) + command
    if mode == 'tty':
        argv = ['script', '-q', '-e', '-c', shlex.join(argv), '/dev/null']
    environment = COMMON.environment(args, stage, mode)
    environment['BIT_NATIVE_QUIET'] = '1'
    prefix = stage / 'evidence' / f'{workload}-{mode}-{run}-{implementation}'
    prefix.with_suffix('.command.json').write_text(json.dumps({
        'argv': argv, 'cwd': str(root), 'mode': mode, 'implementation': implementation,
        'binary_sha256': binary_before, 'fixture': str(baseline),
        'home': environment_paths['home'], 'globals': environment_paths['globals'],
        'remote': fixtures['remotes'][workload]}, indent=2) + '\n')
    phase = REST.clock_phase(workload)
    before = REST.host_snapshot()
    started = time.perf_counter()
    try:
        output = subprocess.run(argv, cwd=root, env=environment, capture_output=True, timeout=300)
    except subprocess.TimeoutExpired as error:
        prefix.with_suffix('.stdout').write_bytes(error.stdout or b'')
        prefix.with_suffix('.stderr').write_bytes(error.stderr or b'')
        prefix.with_suffix('.timeout.json').write_text(json.dumps({
            'before': before, 'after': REST.host_snapshot(), 'timeout_seconds': error.timeout,
            'elapsed_ms': (time.perf_counter() - started) * 1000,
            'retained_workspace': str(root)}, indent=2) + '\n')
        raise
    elapsed = round((time.perf_counter() - started) * 1000, 3)
    after = REST.host_snapshot()
    prefix.with_suffix('.measurement.json').write_text(json.dumps({
        'elapsed_ms': elapsed, 'exit_code': output.returncode,
        'native_ownership_expected': ownership(workload, mode)}, indent=2) + '\n')
    prefix.with_suffix('.stdout').write_bytes(output.stdout)
    prefix.with_suffix('.stderr').write_bytes(output.stderr)
    prefix.with_suffix('.host.json').write_text(json.dumps({'before': before, 'after': after, 'start_clock_phase': phase}, indent=2) + '\n')
    if COMMON.sha(binary) != binary_before or output.returncode != PREPARE.EXPECTED_CODES[workload]:
        raise RuntimeError(f'{prefix}: binary changed or unexpected command exit')
    trace = output.stdout + output.stderr
    if implementation == 'rust':
        validate_ownership(trace, workload, mode)
    contract = fixtures['contracts'][workload]
    if workload in PREPARE.ERRORS and contract['error_contains'].encode() not in trace:
        raise RuntimeError(f'{prefix}: error occurred before the intended reset boundary')
    oracle = ORACLE.frozen(fixtures, workload)
    if COMMON.sha(root / '.bitmap') != oracle['final_bitmap_sha256'] or stat.S_IMODE((root / '.bitmap').stat().st_mode) != oracle['final_bitmap_mode']:
        raise RuntimeError(f'{prefix}: reset final bitmap differs from the independent Node oracle')
    proof_path = prefix.with_suffix('.bitmap-history.json')
    pending = {'validation_status': 'pending', 'raw_history': raw_history(root), 'baseline': history,
               'oracle': oracle, 'interval_start_ns': before['time_ns'], 'interval_end_ns': after['time_ns']}
    proof_path.write_text(json.dumps(pending, indent=2) + '\n')
    if PREPARE.HISTORY_REASONS[workload]:
        try:
            projection, proof = HISTORY.validate(root, history, oracle, before['time_ns'], after['time_ns'], expected_transitions=1)
        except (OSError, ValueError) as error:
            pending.update(validation_status='failed', error=str(error))
            proof_path.write_text(json.dumps(pending, indent=2) + '\n')
            raise
    else:
        validate_error_history(root, baseline, raw, oracle)
        projection = history
        proof = dict(pending, validation_status='valid: exact zero writes', baseline_raw_history=raw)
    proof_path.write_text(json.dumps(proof, indent=2) + '\n')
    validate_immutable_bytes(root, immutable_raw)
    remote = stage / 'remote'
    if fingerprint(remote) != fingerprint(Path(fixtures['remotes'][workload])):
        raise RuntimeError(f'{prefix}: reset mutated the actual remote')
    workspace = workspace_state(root, objects, history, projection, remote)
    postconditions(root, baseline, contract, strict_objects(root))
    globals_state = STATE.tree(stage / 'globals', globals_directory=True)
    command_clock(stage / 'globals', globals_state, prefix, before['time_ns'], after['time_ns'], Path(environment_paths['globals']))
    result = {'status': output.returncode, 'stdout': STATE.normalized(output.stdout), 'stderr': STATE.normalized(output.stderr),
              'workspace': workspace, 'home': STATE.tree(stage / 'home'), 'globals': globals_state,
              'remote': STATE.tree(remote)}
    prefix.with_suffix('.state.json').write_text(json.dumps(result, indent=2) + '\n')
    return elapsed, result


def prewarm(args, stage, fixtures):
    """Copy only the existing validated builtin-fact receipt out of disposable status workspaces."""
    records = fixtures.setdefault('builtin_facts_prewarming', {})
    for workload, paths in fixtures['workload_environment'].items():
        warm = stage / 'builtin-warmup' / workload
        warm.mkdir(parents=True, exist_ok=True)
        clean = warm / 'clean'
        if not clean.exists():
            shutil.copytree(fixtures['workloads']['merged-all'], clean, symlinks=True)
            with (clean / 'comp1/index.js').open('a') as source:
                source.write("\nrequire('node:path');\n")
        inputs = dict(paths)
        if workload in records:
            inputs['builtin_facts_prewarming'] = records[workload]
        records[workload] = COMMON.PREPARE.prewarm_builtin_facts(
            args, warm, inputs, COMMON.environment(args, stage, 'timed'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['rust', 'node-binary', 'node-cli', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--stage', type=Path)
    parser.add_argument('--host-monitor', type=Path)
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--workload', choices=list(PREPARE.WORKLOADS), action='append')
    args = parser.parse_args()
    if args.runs != 5:
        parser.error('qualification requires exactly five alternating pairs per mode')
    for key in ['rust', 'node_binary', 'node_cli', 'output']:
        setattr(args, key, getattr(args, key).resolve())
    stage = args.stage.resolve() if args.stage else Path(tempfile.mkdtemp(prefix='lane-graph-reset-bench-'))
    stage.mkdir(parents=True, exist_ok=True)
    (stage / 'evidence').mkdir(exist_ok=True)
    if subprocess.check_output([str(args.node_binary), '--version'], text=True).strip() != 'v22.22.0' or json.loads((args.node_cli.parent.parent / 'package.json').read_text())['version'] != '2.2.94':
        raise RuntimeError('requires pinned Node22.22.0 / Bit2.2.94')
    manifest = stage / 'fixtures.json'
    if not manifest.exists():
        if not args.prepare_only:
            raise RuntimeError('explicit --prepare-only is required before measurement')
        baselines, remotes, home, globalsdir = PREPARE.seed(args, stage, COMMON.environment(args, stage, 'timed'))
        fixtures = {'workloads': {key: str(value) for key, value in baselines.items()},
                    'remotes': {key: str(value) for key, value in remotes.items()},
                    'home': str(home), 'globals': str(globalsdir), 'remote_path': str(stage / 'remote')}
        fixtures.update(json.loads((stage / 'graph-reset-contracts.json').read_text()))
        manifest.write_text(json.dumps(fixtures, indent=2) + '\n')
    fixtures = json.loads(manifest.read_text())
    contracts = stage / 'graph-reset-contracts.json'
    if any(fixtures[key] != value for key, value in json.loads(contracts.read_text()).items()):
        raise RuntimeError('manifest and graph-reset contracts disagree')
    if fixtures['remote_path'] != str(stage / 'remote'):
        raise RuntimeError('fixtures require their original absolute replay path')
    if args.prepare_only:
        if fixtures.get('graph_reset_bitmap_history_oracles') and not fixtures.get('builtin_facts_prewarming'):
            raise RuntimeError('refusing to alter globals after an oracle was frozen')
        prewarm(args, stage, fixtures)
        fixtures['graph_reset_bitmap_history_oracles'] = ORACLE.prepare(args, stage, fixtures, COMMON.environment(args, stage, 'timed'))
        manifest.write_text(json.dumps(fixtures, indent=2) + '\n')
        print(manifest)
        return
    selected = args.workload or list(PREPARE.WORKLOADS)
    for name in selected:
        ORACLE.frozen(fixtures, name)
    source = Path(__file__).resolve().parents[2]
    source_before = COMMON.native_source(source)
    immutable_paths = {str(Path(value)) for value in fixtures['workloads'].values()} | {str(Path(value)) for value in fixtures['remotes'].values()}
    immutable_paths |= {str(Path(value)) for group in fixtures['workload_environment'].values() for value in group.values()}
    fingerprints = {path: fingerprint(Path(path)) for path in sorted(immutable_paths)}
    helpers = {str(path): COMMON.sha(path) for path in sorted(Path(__file__).parent.iterdir()) if path.suffix in {'.py', '.cjs'}}
    binary_before = {key: COMMON.sha(getattr(args, key)) for key in ['rust', 'node_binary', 'node_cli']}
    manifest_before, contracts_before = COMMON.sha(manifest), COMMON.sha(contracts)
    oracles = {name: COMMON.sha(Path(value['path'])) for name, value in fixtures['graph_reset_bitmap_history_oracles'].items()}
    measurements, verified = {}, []
    for workload in selected:
        measurements[workload] = {}
        for mode in ['timed', 'ci', 'tty']:
            samples = {'rust': [], 'node': []}
            for run in range(5):
                pair = {}
                for implementation in (['node', 'rust'] if run % 2 == 0 else ['rust', 'node']):
                    elapsed, pair[implementation] = execute(args, stage, fixtures, workload, mode, run, implementation)
                    samples[implementation].append(elapsed)
                if pair['node'] != pair['rust']:
                    differences = [key for key in pair['node'] if pair['node'][key] != pair['rust'][key]]
                    raise RuntimeError(f'{workload}/{mode}/{run}: strict parity failed: {differences}; {stage}/evidence')
                verified.append({'workload': workload, 'mode': mode, 'pair': run, 'native_ownership': ownership(workload, mode), 'exit_code': pair['rust']['status']})
            measurements[workload][mode] = {'native_ownership': ownership(workload, mode), 'speed_claim_eligible': False,
                'runs_ms': samples, 'median_ms': {key: statistics.median(value) for key, value in samples.items()}}
            print(f'verified {workload}/{mode}: {measurements[workload][mode]["median_ms"]}', file=sys.stderr, flush=True)
    if COMMON.native_source(source) != source_before or COMMON.sha(manifest) != manifest_before or COMMON.sha(contracts) != contracts_before:
        raise RuntimeError('source/fixture recipe changed during qualification')
    for path, digest in fingerprints.items():
        if fingerprint(Path(path)) != digest:
            raise RuntimeError(f'immutable fixture changed: {path}')
    for path, digest in helpers.items():
        if COMMON.sha(Path(path)) != digest:
            raise RuntimeError(f'benchmark helper changed: {path}')
    for key, digest in binary_before.items():
        if COMMON.sha(getattr(args, key)) != digest:
            raise RuntimeError(f'binary/CLI changed: {key}')
    for name, digest in oracles.items():
        if COMMON.sha(Path(fixtures['graph_reset_bitmap_history_oracles'][name]['path'])) != digest:
            raise RuntimeError(f'frozen oracle changed: {name}')
    report = {'stage': str(stage), 'platform': platform.platform(), 'native_source': source_before,
              'correctness_valid': True, 'performance_valid': False, 'fixtures': fixtures,
              'immutable_fingerprints': fingerprints, 'fixture_manifest_sha256': manifest_before,
              'contracts_sha256': contracts_before, 'helper_sha256': helpers,
              'binary_sha256': binary_before, 'bitmap_history_oracle_sha256': oracles,
              'verified_pairs': len(verified), 'native_pairs': sum(row['native_ownership'] for row in verified),
              'verified': verified, 'workloads': measurements, 'reproduce': [sys.executable, *sys.argv],
              'performance_qualification': {'status': 'awaiting closed whole-run external monitor qualification',
                  'predeclared_max_host_busy_percent': 80, 'required_sample_interval_seconds': 0.5,
                  'required_start_gate_seconds': 20, 'required_start_gate_max_busy_percent': 30},
              'normalization': ['native trace lines and validated completed-in durations',
                  'existing checksum-validated cache-index timestamps and command-history ISO/PID fields',
                  'canonical reset last-command timestamp, only if changed and inside command interval',
                  'independently validated raw bitmap backups; overwritten preimages remain oracle-only'],
              'excluded_implementation_state': ['exact workspace-root debug.log', 'exact globals/logs subtree'],
              'ownership_note': 'Only declared CI canonical-error modes delegate; no native speed claims for delegated rows.',
              'warmup_note': 'Real Node fixtures and disposable native builtin-fact status preparation are untimed; only the existing validated builtin cache is retained. No first-use claim or fabricated results.'}
    if args.host_monitor:
        target = stage / 'host-monitor.json'
        target.write_bytes(args.host_monitor.read_bytes())
        report['host_monitor'] = {'path': str(target), 'sha256': COMMON.sha(target)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
