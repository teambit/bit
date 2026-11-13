#!/usr/bin/env python3
"""Qualify successful VCS/tooling operations in five alternating pairs per output mode.

Every run restores the same absolute workspace, file remote, home and globals.
Raw object hashes are retained as evidence; only validated per-run export clocks
are projected for equality. All other object data and filesystem state are exact.
"""
import argparse
import datetime
import hashlib
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
import zlib

sys.dont_write_bytecode = True


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


COMMON = load('tooling_common', 'bench-stash.py')
CLOSEOUT = load('tooling_closeout', 'bench-vcs-closeout.py')
PREPARE = load('tooling_prepare', 'prepare-vcs-tooling-benchmark.py')
CLOSEOUT.PREPARE = PREPARE
STATE = COMMON.STATE
INSTALL_CLOCKS = load('tooling_install_clocks', 'bench-lane-restoration.py')
HELPERS = ['bench-vcs-tooling.py', 'prepare-vcs-tooling-benchmark.py',
           'bench-vcs-closeout.py', 'bench-stash.py', 'prepare-stash-benchmark.py',
           'stash-benchmark-state.py', 'bench-lane-restoration.py',
           'prepare-vcs-closeout-history-oracle.py',
           'prepare-lane-restoration-history-oracle.py',
           'bitmap-history-oracle.py', 'prepare-bitmap-history-oracle.py',
           'prepare-lane-restoration-benchmark.py', 'scope-bitmap-history-oracle.cjs']


def hash_bytes(data):
    return hashlib.sha256(data).hexdigest()


def command_clock(date, window):
    if not isinstance(date, str) or not date.isdecimal():
        raise RuntimeError(f'invalid export clock: {date!r}')
    value = int(date)
    if not window[0] <= value <= window[1]:
        raise RuntimeError(f'export clock outside measured command: {date}')
    return '<command-clock>'


def object_inventory(scope, window, export):
    projected, raw = {}, {}
    for path in sorted((scope / 'objects').glob('*/*')):
        if not path.is_file() or path.is_symlink():
            raise RuntimeError(f'nonregular object {path}')
        reference = path.parent.name + path.name
        compressed = path.read_bytes()
        raw[reference] = {'sha256': hash_bytes(compressed),
                          'mode': path.stat().st_mode & 0o7777,
                          'uid': path.stat().st_uid, 'gid': path.stat().st_gid,
                          'prefix_mode': path.parent.stat().st_mode & 0o7777}
        decoded = zlib.decompress(compressed)
        header, separator, body = decoded.partition(b'\0')
        if not separator:
            raise RuntimeError(f'missing object header separator: {path}')
        kind, ref, length = header.decode().split(' ')
        if ref != reference or int(length) != len(body.decode('utf-8', errors='replace').encode('utf-16-le')) // 2:
            raise RuntimeError(f'invalid object identity or serializer length: {path}')
        if export and kind in {'Component', 'ExportMetadata'}:
            value = json.loads(body)
            if kind == 'Component':
                identity = f"{value['scope']}/{value['name']}".encode()
                if hashlib.sha1(identity).hexdigest() != reference:
                    raise RuntimeError(f'component identity/hash mismatch: {path}')
                for field in ['remotes', 'scopeList', 'scopesList']:
                    for row in value.get(field, []):
                        if 'date' in row and window[0] <= int(row['date']) <= window[1]:
                            row['date'] = command_clock(row['date'], window)
            elif 'exportDate' in value:
                value['exportDate'] = command_clock(value['exportDate'], window)
            body_projection = value
        else:
            body_projection = body.hex()
        projected[reference] = {'kind': kind, 'body': body_projection,
                                'mode': raw[reference]['mode'],
                                'uid': raw[reference]['uid'], 'gid': raw[reference]['gid'],
                                'prefix_mode': raw[reference]['prefix_mode']}
    return projected, raw


def directory_metadata(path):
    metadata = path.stat()
    return {'mode': metadata.st_mode & 0o7777,
            'uid': metadata.st_uid, 'gid': metadata.st_gid}


def project_export_index(root, tree):
    path = root / 'index.json'
    raw = path.read_bytes()
    value = json.loads(raw)
    if set(value) != {'components', 'lanes'} or raw != (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode():
        raise RuntimeError('unexpected exported scope index shape/serialization')
    expected = {(PREPARE.SCOPE, f'comp{index:02d}') for index in range(12)}
    rows = value['components']
    identities = [(row['id']['scope'], row['id']['name']) for row in rows]
    if len(identities) != len(expected) or set(identities) != expected or value['lanes'] != []:
        raise RuntimeError('unexpected/duplicate export index identities')
    # Published mergeComponents pushes Promise.all completion results, which addMany preserves.
    value['components'] = sorted(rows, key=lambda row: (row['id']['scope'], row['id']['name']))
    projected = (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()
    entry = tree['index.json']
    if entry != ['file', path.stat().st_mode & 0o7777, hash_bytes(raw)]:
        raise RuntimeError('export index already projected')
    tree['index.json'] = ['file', entry[1], hash_bytes(projected)]
    return tree


def projected_tree(root, workspace, window, export):
    tree = STATE.tree(root, workspace=workspace)
    if not workspace:
        tree = {key: value for key, value in tree.items()
                if key != 'objects' and not key.startswith('objects/')}
        return project_export_index(root, tree) if export else tree
    if export:
        last = root / '.bit/last-export.json'
        if last.is_file():
            value = json.loads(last.read_bytes())
            date = value.get('timestamp')
            if not isinstance(date, str):
                raise RuntimeError('missing last-export timestamp')
            parsed = datetime.datetime.fromisoformat(date.replace('Z', '+00:00'))
            if not window[0] <= int(parsed.timestamp() * 1000) <= window[1]:
                raise RuntimeError('last-export timestamp outside command')
            value['timestamp'] = '<command-clock>'
            tree['.bit/last-export.json'] = ['file', last.stat().st_mode & 0o7777,
                                             hash_bytes(json.dumps(value, sort_keys=True).encode())]
    return tree


def details_clock(root, tree, prefix, start_ns, end_ns):
    path = root / 'last-command-details/meta.json'
    raw = path.read_bytes()
    value = json.loads(raw)
    if set(value) != {'command', 'timestamp'} or value['command'] != 'switch':
        raise RuntimeError('unexpected last-command metadata schema/command')
    if raw != json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode():
        raise RuntimeError('unexpected last-command metadata serialization')
    date = value['timestamp']
    if not isinstance(date, str):
        raise RuntimeError('invalid last-command timestamp')
    parsed = datetime.datetime.fromisoformat(date.replace('Z', '+00:00'))
    if parsed.tzinfo is None or parsed.isoformat(timespec='milliseconds').replace('+00:00', 'Z') != date:
        raise RuntimeError('noncanonical last-command timestamp')
    clock_ms = int(parsed.timestamp() * 1000)
    if not start_ns // 1_000_000 <= clock_ms <= end_ns // 1_000_000:
        raise RuntimeError('last-command timestamp outside command window')
    key = 'last-command-details/meta.json'
    expected = ['file', path.stat().st_mode & 0o7777, hash_bytes(raw)]
    if tree.get(key) != expected:
        raise RuntimeError('last-command metadata already projected')
    prefix.with_suffix('.last-command-meta.raw').write_bytes(raw)
    value['timestamp'] = '<command-clock>'
    tree[key] = ['file', expected[1], hash_bytes(json.dumps(value, separators=(',', ':')).encode())]
    return tree


def receipt_checks(workload, root):
    if not workload.startswith('subscriber-'):
        return
    phases = (root / 'install-compat-phases').read_text().splitlines()
    expected = ['install-pre', 'manager-pre', 'manager-run', 'manager-post']
    if phases != expected:
        raise RuntimeError(f'incomplete subscriber callback lifecycle: {phases}')
    receiver = json.loads((root / 'install-compat-receiver.json').read_bytes())
    expected_receiver = {'sameInstaller': True, 'sameArgs': True,
                         'sameOptions': False, 'samePackageOptions': True,
                         'optional': False, 'reassignedRoot': True}
    if receiver != expected_receiver:
        raise RuntimeError(f'incorrect subscriber receiver/options: {receiver}')
    planning = json.loads((root / 'install-compat-planning.json').read_bytes())
    if planning != {'seenComp1': True}:
        raise RuntimeError(f'provider lost component-load state before install: {planning}')


def execute(args, stage, fixtures, workload, mode, pair, implementation):
    for source, name in CLOSEOUT.fixture_paths(stage, fixtures, workload):
        COMMON.restore(source, stage / name)
    root = stage / 'workspace'
    baseline_history = STATE.bitmap_history(root)
    _, raw_local_before = object_inventory(STATE.scope(root), (0, 0), False)
    _, raw_remote_before = object_inventory(stage / 'remote', (0, 0), False)
    binary = args.node_binary if implementation == 'node' else args.rust
    command = PREPARE.WORKLOADS[workload]
    argv = ([str(binary), str(args.node_cli)] if implementation == 'node' else [str(binary)]) + command
    if mode == 'tty':
        argv = ['script', '-q', '-e', '-c', shlex.join(argv), '/dev/null']
    environment = COMMON.environment(args, stage, mode)
    environment.pop('BIT_FEATURES', None)
    environment.pop('NODE_OPTIONS', None)
    environment['BIT_NATIVE_QUIET'] = '1'
    if implementation == 'node':
        environment['BIT_NATIVE'] = 'off'
    before_binary = COMMON.sha(binary)
    host_before = CLOSEOUT.host_snapshot()
    start_ns = time.time_ns()
    start_clock = start_ns // 1_000_000
    started = time.perf_counter()
    output = subprocess.run(argv, cwd=root, env=environment, capture_output=True, timeout=300)
    elapsed = round((time.perf_counter() - started) * 1000, 3)
    end_ns = time.time_ns()
    end_clock = end_ns // 1_000_000
    host_after = CLOSEOUT.host_snapshot()
    if COMMON.sha(binary) != before_binary:
        raise RuntimeError('measured binary changed during command')
    prefix = stage / 'evidence' / f'{workload}-{mode}-{pair}-{implementation}'
    prefix.with_suffix('.stdout').write_bytes(output.stdout)
    prefix.with_suffix('.stderr').write_bytes(output.stderr)
    prefix.with_suffix('.host.json').write_text(json.dumps({
        'before': host_before, 'after': host_after}, indent=2) + '\n')
    if output.returncode:
        raise RuntimeError(f'{prefix}: failed command is correctness-only, never speed evidence')
    if implementation == 'rust':
        marker = f'running `{command[0]}` natively'.encode()
        trace = output.stdout + output.stderr
        if marker not in trace or b'declined' in trace or b'delegating:' in trace:
            raise RuntimeError(f'{prefix}: command did not retain native VCS ownership')
    receipt_checks(workload, root)
    window = (start_clock, end_clock)
    export = workload == 'shared-group-export'
    local_objects, raw_local = object_inventory(STATE.scope(root), window, export)
    remote_objects, raw_remote = object_inventory(stage / 'remote', window, export)
    workspace_tree = projected_tree(root, True, window, export)
    if workload.startswith('subscriber-'):
        INSTALL_CLOCKS.installation_clocks(root, {'tree': workspace_tree}, prefix, start_ns, end_ns)
    if export:
        prefix.with_suffix('.scope-index.raw').write_bytes((stage / 'remote/index.json').read_bytes())
    history_projection = None
    if workload in CLOSEOUT.HISTORY.HISTORY_REASONS:
        oracle = CLOSEOUT.HISTORY.frozen(fixtures, workload)
        raw_path = prefix.with_suffix('.bitmap-history.json')
        pending = {'validation_status': 'pending', 'oracle': oracle,
                   'baseline': baseline_history,
                   'raw_history': CLOSEOUT.HISTORY.CORE.raw_history(root)}
        raw_path.write_text(json.dumps(pending, indent=2) + '\n')
        try:
            history_projection, raw = CLOSEOUT.HISTORY.VALIDATOR.validate(
                root, baseline_history, oracle, start_ns, end_ns,
                expected_transitions=len(CLOSEOUT.HISTORY.HISTORY_REASONS[workload]))
        except (ValueError, OSError) as error:
            pending.update(validation_status='failed', error=str(error))
            raw_path.write_text(json.dumps(pending, indent=2) + '\n')
            raise
        raw_path.write_text(json.dumps(raw, indent=2) + '\n')
    elif STATE.bitmap_history(root) != baseline_history:
        raise RuntimeError('zero-write active-lane import changed raw bitmap history')
    globals_tree = STATE.tree(stage / 'globals', globals_directory=True)
    if workload == 'subscriber-switch':
        details_clock(stage / 'globals', globals_tree, prefix, start_ns, end_ns)
    result = {'status': output.returncode,
              'stdout': STATE.normalized(output.stdout),
              'stderr': STATE.normalized(output.stderr),
              'workspace': workspace_tree,
              'bitmap_history': history_projection if history_projection is not None else STATE.qualified_bitmap_history(root, baseline_history),
              'local_objects': local_objects,
              'local_objects_directory': directory_metadata(STATE.scope(root) / 'objects'),
              'remote_objects_directory': directory_metadata(stage / 'remote/objects'),
              'remote_tree': projected_tree(stage / 'remote', False, window, export),
              'remote_objects': remote_objects,
              'home': STATE.tree(stage / 'home'),
              'globals': globals_tree}
    prefix.with_suffix('.raw-objects.json').write_text(json.dumps({
        'local_before': raw_local_before, 'remote_before': raw_remote_before,
        'local': raw_local, 'remote': raw_remote}, indent=2) + '\n')
    prefix.with_suffix('.state.json').write_text(json.dumps(result, indent=2) + '\n')
    return elapsed, result


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
        parser.error('publishable qualification requires five pairs per mode')
    if args.runs < 1 or (args.workload and len(args.workload) != len(set(args.workload))):
        parser.error('invalid run count or duplicate workload')
    for name in ['rust', 'node_binary', 'node_cli', 'output']:
        setattr(args, name, getattr(args, name).resolve())
    stage = args.stage.resolve() if args.stage else Path(tempfile.mkdtemp(prefix='vcs-tooling-bench-'))
    stage.mkdir(parents=True, exist_ok=True)
    fixtures, node_version, bit_version, package = CLOSEOUT.prerequisite(args, stage)
    if args.prepare_only:
        print(json.dumps({'stage': str(stage), 'fixtures': fixtures}, indent=2))
        return
    (stage / 'evidence').mkdir(exist_ok=True)
    source_before = COMMON.native_source(Path(__file__).resolve().parents[2])
    fixture_before = CLOSEOUT.fingerprints(fixtures)
    helper_before = {name: COMMON.sha(Path(__file__).with_name(name)) for name in HELPERS}
    binary_before = {name: COMMON.sha(getattr(args, name))
                     for name in ['rust', 'node_binary', 'node_cli']}
    package_before = COMMON.sha(package)
    results, verified = {}, []
    for workload in args.workload or PREPARE.WORKLOADS:
        results[workload] = {}
        for mode in ['timed', 'ci', 'tty']:
            samples = {'node': [], 'rust': []}
            for pair in range(args.runs):
                outcomes = {}
                for implementation in (['node', 'rust'] if pair % 2 == 0 else ['rust', 'node']):
                    elapsed, outcomes[implementation] = execute(
                        args, stage, fixtures, workload, mode, pair, implementation)
                    samples[implementation].append(elapsed)
                if outcomes['node'] != outcomes['rust']:
                    different = [key for key in outcomes['node']
                                 if outcomes['node'][key] != outcomes['rust'][key]]
                    raise RuntimeError(f'{workload}/{mode}/{pair}: {different} differ; see {stage}/evidence')
                verified.append({'workload': workload, 'mode': mode, 'pair': pair,
                                 'native_ownership': True})
            results[workload][mode] = {'native_ownership': True, 'runs_ms': samples,
                'median_ms': {key: statistics.median(values) for key, values in samples.items()},
                'performance_claim_eligible': True}
            print(f'verified {workload} {mode}: {args.runs} pairs', file=sys.stderr, flush=True)
    if COMMON.native_source(Path(__file__).resolve().parents[2]) != source_before \
            or CLOSEOUT.fingerprints(fixtures) != fixture_before:
        raise RuntimeError('source or frozen fixture changed during qualification')
    if any(COMMON.sha(Path(__file__).with_name(name)) != digest
           for name, digest in helper_before.items()):
        raise RuntimeError('benchmark helper changed during qualification')
    if any(COMMON.sha(getattr(args, name)) != digest for name, digest in binary_before.items()) \
            or COMMON.sha(package) != package_before:
        raise RuntimeError('binary or published package changed during qualification')
    monitor = None
    if args.host_monitor:
        monitor_path = stage / 'host-monitor.json'
        monitor_path.write_bytes(args.host_monitor.read_bytes())
        monitor = {'path': str(monitor_path), 'sha256': COMMON.sha(monitor_path)}
    report = {'stage': str(stage), 'platform': platform.platform(),
              'node_version': node_version, 'bit_version': bit_version,
              'correctness_valid': True, 'performance_valid': False,
              'complete_workload_set': set(results) == set(PREPARE.WORKLOADS),
              'qualification_eligible': not args.debug_smoke and args.runs == 5,
              'successful_workloads': sorted(results), 'correctness_only_workloads': [],
              'performance_qualification': {'status': 'awaiting full external CPU monitor audit',
                  'predeclared_max_host_busy_percent': 80, 'required_sample_interval_seconds': 0.5,
                  'required_start_gate_seconds': 20, 'required_start_gate_max_busy_percent': 30},
              'native_source': source_before, 'helper_sha256': helper_before,
              'binary_sha256': binary_before, 'bit_package_json_sha256': package_before,
              'fixtures': fixtures, 'fixture_sha256': fixture_before,
              'host_monitor': monitor, 'host_command_samples': str(stage / 'evidence/*.host.json'),
              'normalization': ['native trace', 'completed-in durations',
                  'validated per-command export, pnpm installation and last-command-details clocks',
                  'validated unordered twelve-component export index rows; every field retained',
                  'independent Node bitmap write transcripts',
                  'validated command-history timestamps/PIDs and cache-index receipts'],
              'export_clock_projection': 'validated against each command window; raw hashes retained',
              'excluded_implementation_state': ['workspace-root debug.log', 'BIT_GLOBALS_DIR/logs subtree'],
              'reproduce': [sys.executable, *sys.argv], 'verified_pairs': len(verified),
              'verified': verified, 'workloads': results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
