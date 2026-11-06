#!/usr/bin/env python3
"""Untimed released reset transcripts; timed commands never load the capture hook.

SnappingMain.reset persists its successful result through onDestroy('reset') once.
The two canonical-error workloads stop before that call and must preserve every
raw bitmap-history byte and mode. VersionHistory population on errors remains
part of the runner's full-state comparison, rather than a bitmap-write allowance.
"""
import base64
import importlib.util
import json
from pathlib import Path
import shutil
import stat
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


CORE = load('graph_reset_oracle_core', 'prepare-bitmap-history-oracle.py')
FIXTURE = load('graph_reset_oracle_fixture', 'prepare-lane-graph-reset-benchmark.py')
COMMON = load('graph_reset_oracle_common', 'bench-stash.py')
VALIDATOR = load('graph_reset_oracle_validator', 'bitmap-history-oracle.py')
WORKLOADS = tuple(FIXTURE.WORKLOADS)
REFERENCE_KEY = 'graph_reset_bitmap_history_oracles'


def sources(fixtures, workload):
    environment = fixtures['workload_environment'][workload]
    return {'workspace': Path(fixtures['workloads'][workload]),
            'remote': Path(fixtures['remotes'][workload]),
            'home': Path(environment['home']), 'globals': Path(environment['globals'])}


def expected(workload):
    return (1, []) if workload in FIXTURE.ERRORS else (0, ['reset'])


def prepare(args, stage, fixtures, environment):
    if not args.prepare_only:
        raise RuntimeError('reset oracle generation requires explicit --prepare-only')
    references = dict(fixtures.get(REFERENCE_KEY, {}))
    for workload in WORKLOADS:
        destination = stage / f'graph-reset-{workload}-bitmap-history-oracle.json'
        if workload in references:
            frozen(fixtures, workload)
            continue
        if destination.exists():
            raise RuntimeError(f'refusing to overwrite an unbound oracle: {destination}')
        record = prepare_one(args, stage, fixtures, environment, workload)
        destination.write_text(json.dumps(record, indent=2) + '\n')
        references[workload] = {'path': str(destination), 'sha256': CORE.sha(destination.read_bytes())}
        fixtures[REFERENCE_KEY] = references
        (stage / 'fixtures.json').write_text(json.dumps(fixtures, indent=2) + '\n')
    return references


def frozen(fixtures, workload):
    reference = fixtures[REFERENCE_KEY][workload]
    path = Path(reference['path'])
    if path.is_symlink() or not path.is_file() or CORE.sha(path.read_bytes()) != reference['sha256']:
        raise RuntimeError('frozen reset oracle bytes changed')
    record = json.loads(path.read_text())
    code, _ = expected(workload)
    if (record['workload'] != workload or record['cli_arguments'] != fixtures['commands'][workload]
            or record['expected_exit_code'] != code):
        raise RuntimeError('reset oracle workload/command/exit contract changed')
    if record['fixture_sha256'] != {key: CORE.fingerprint(value) for key, value in sources(fixtures, workload).items()}:
        raise RuntimeError('reset oracle immutable input changed')
    if record['contracts_sha256'] != CORE.sha((path.parent / 'graph-reset-contracts.json').read_bytes()):
        raise RuntimeError('reset oracle contracts changed')
    validate_rows(record['transitions'], workload)
    if code and record['raw_history'] != record['baseline_raw_history']:
        raise RuntimeError('reset error oracle changed bitmap history')
    if code and (record['final_bitmap_sha256'] != record['baseline_bitmap_sha256']
                 or record['final_bitmap_mode'] != record['baseline_bitmap_mode']):
        raise RuntimeError('reset error oracle changed the bitmap without a backup')
    return record


def prepare_one(args, stage, fixtures, environment, workload):
    inputs = sources(fixtures, workload)
    before = {key: CORE.fingerprint(path) for key, path in inputs.items()}
    with tempfile.TemporaryDirectory(prefix='reset-bitmap-oracle-', dir=stage.parent) as temporary:
        private = Path(temporary)
        saved, touched = {}, []
        try:
            for key, source in inputs.items():
                mutable = stage / key
                if (source.resolve() == mutable.resolve() or source.resolve() in mutable.resolve().parents
                        or mutable.resolve() in source.resolve().parents or mutable.is_symlink()):
                    raise RuntimeError('reset baseline overlaps mutable replay path')
                if mutable.exists():
                    saved[key] = CORE.fingerprint(mutable)
                    mutable.rename(private / key)
                touched.append(key)
                shutil.copytree(source, mutable, symlinks=True)
            record = observe(args, stage, private, fixtures, environment, workload, before)
        finally:
            for key in reversed(touched):
                mutable = stage / key
                if mutable.exists():
                    shutil.rmtree(mutable)
                if key in saved:
                    (private / key).rename(mutable)
                    if CORE.fingerprint(mutable) != saved[key]:
                        raise RuntimeError(f'reset replay restoration changed: {key}')
            for key, source in inputs.items():
                if CORE.fingerprint(source) != before[key]:
                    raise RuntimeError(f'reset immutable fixture changed: {key}')
    return record


def observe(args, stage, private, fixtures, environment, workload, fixture_hashes):
    node, cli = Path(args.node_binary).resolve(), Path(args.node_cli).resolve()
    hook = Path(__file__).with_name('scope-bitmap-history-oracle.cjs').resolve()
    package = cli.parent.parent
    if subprocess.check_output([str(node), '--version'], text=True).strip() != 'v22.22.0':
        raise RuntimeError('reset oracle requires Node22.22.0')
    if json.loads((package / 'package.json').read_text())['version'] != '2.2.94':
        raise RuntimeError('reset oracle requires Bit2.2.94')
    env = dict(environment)
    for key in ['NODE_OPTIONS', 'CI', 'FORCE_COLOR', 'NO_COLOR', 'BIT_NATIVE_TRACE']:
        env.pop(key, None)
    env.update(HOME=str(stage / 'home'), USERPROFILE=str(stage / 'home'),
               BIT_GLOBALS_DIR=str(stage / 'globals'), BIT_NATIVE='off', BIT_NATIVE_QUIET='1',
               BITMAP_HISTORY_ORACLE_DIRECTORY=str(private),
               BITMAP_HISTORY_ORACLE_ROOT=str(stage / 'workspace'),
               BITMAP_HISTORY_ORACLE_PACKAGE=str(package))
    command = [str(node), '--require', str(hook), str(cli), *fixtures['commands'][workload]]
    evidence = stage / f'graph-reset-{workload}-bitmap-oracle-evidence'
    evidence.mkdir(exist_ok=False)
    provenance = fingerprints(args, hook)
    baseline = COMMON.STATE.bitmap_history(stage / 'workspace')
    baseline_raw = raw_history(stage / 'workspace')
    bitmap = stage / 'workspace/.bitmap'
    baseline_bitmap = bitmap.read_bytes()
    baseline_mode = optional_mode(bitmap)
    started = time.time_ns()
    try:
        output = subprocess.run(command, cwd=stage / 'workspace', env=env, capture_output=True, timeout=300)
    except subprocess.TimeoutExpired as error:
        (evidence / 'stdout').write_bytes(error.stdout or b'')
        (evidence / 'stderr').write_bytes(error.stderr or b'')
        raise
    finally:
        journal = private / 'transitions.jsonl'
        if journal.exists():
            (evidence / 'transitions.jsonl').write_bytes(journal.read_bytes())
    ended = time.time_ns()
    (evidence / 'stdout').write_bytes(output.stdout)
    (evidence / 'stderr').write_bytes(output.stderr)
    rows = [json.loads(line) for line in journal.read_text().splitlines()] if journal.exists() else []
    final = (stage / 'workspace/.bitmap').read_bytes()
    record = {'schema': 1, 'workload': workload, 'cli_arguments': fixtures['commands'][workload],
              'expected_exit_code': expected(workload)[0], 'exit_code': output.returncode,
              'transitions': rows, 'final_bitmap_sha256': CORE.sha(final),
              'baseline_bitmap_sha256': CORE.sha(baseline_bitmap),
              'baseline_bitmap_mode': baseline_mode, 'final_bitmap_mode': optional_mode(bitmap),
              'raw_history': raw_history(stage / 'workspace'), 'baseline_raw_history': baseline_raw,
              'command': command, 'evidence': str(evidence), 'fixture_sha256': fixture_hashes,
              'contracts_sha256': CORE.sha((stage / 'graph-reset-contracts.json').read_bytes()),
              'interval_start_ns': started, 'interval_end_ns': ended, **provenance}
    (evidence / 'observation.json').write_text(json.dumps(record, indent=2) + '\n')
    (evidence / 'final.bitmap').write_bytes(final)
    if output.returncode != expected(workload)[0]:
        raise RuntimeError(f'released reset oracle exit mismatch: {evidence}')
    validate_rows(rows, workload)
    if expected(workload)[1]:
        _, raw = VALIDATOR.validate(stage / 'workspace', baseline, record, started, ended, expected_transitions=1)
        (evidence / 'raw-history.json').write_text(json.dumps(raw, indent=2) + '\n')
    elif (record['raw_history'] != baseline_raw or final != baseline_bitmap
          or record['final_bitmap_mode'] != baseline_mode):
        raise RuntimeError('released reset error changed bitmap/history bytes or modes')
    if fingerprints(args, hook) != provenance:
        raise RuntimeError('reset producer/source/helper changed during preparation')
    return record


def fingerprints(args, hook):
    root = Path(__file__).resolve().parents[2]
    def git(*arguments):
        return subprocess.check_output(['git', *arguments], cwd=root, text=True).strip()
    names = [Path(__file__).name, 'prepare-bitmap-history-oracle.py', 'bitmap-history-oracle.py',
             'prepare-lane-graph-reset-benchmark.py', 'bench-stash.py', hook.name]
    return {'producer_head': git('rev-parse', 'HEAD'), 'producer_tree': git('rev-parse', 'HEAD^{tree}'),
            'producer_status': git('status', '--porcelain'), 'native_source': CORE.native_source(),
            'node_sha256': CORE.sha(Path(args.node_binary).read_bytes()),
            'cli_sha256': CORE.sha(Path(args.node_cli).read_bytes()),
            'hook_sha256': CORE.sha(hook.read_bytes()),
            'preparer_sha256': CORE.sha(Path(__file__).read_bytes()),
            'helper_sha256': {name: CORE.sha(Path(__file__).with_name(name).read_bytes()) for name in names}}


def validate_rows(rows, workload):
    reasons = expected(workload)[1]
    if len(rows) != len(reasons) or [row.get('reason') for row in rows] != reasons:
        raise RuntimeError('released reset bitmap transition count/order differs')
    for index, row in enumerate(rows):
        if row.get('sequence') != index or any(key.endswith('error') for key in row):
            raise RuntimeError(f'failed reset oracle transition: {row}')
        base64.b64decode(row['preimage_base64'], validate=True)
        if row['mode'] != row['backup_mode']:
            raise RuntimeError('reset bitmap preimage/backup mode mismatch')


def optional_mode(path, directory=False):
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return None
    if not (stat.S_ISDIR if directory else stat.S_ISREG)(metadata.st_mode):
        raise RuntimeError(f'nonordinary reset history input: {path}')
    return stat.S_IMODE(metadata.st_mode)


def raw_history(root):
    scope = root / '.bit'
    if not scope.exists():
        scope = root / '.git/bit'
    if optional_mode(scope, directory=True) is None:
        raise RuntimeError('reset oracle scope absent')
    directory, metadata = scope / 'bitmap-history', scope / 'bitmap-history-metadata.txt'
    directory_mode, metadata_mode = optional_mode(directory, True), optional_mode(metadata)
    body = metadata.read_bytes() if metadata_mode is not None else b''
    backups = {}
    for path in sorted(directory.iterdir()) if directory_mode is not None else []:
        mode = optional_mode(path)
        raw = path.read_bytes()
        backups[path.name] = {'bytes_base64': base64.b64encode(raw).decode(), 'mode': mode,
                              'sha256': CORE.sha(raw)}
    return {'metadata_base64': base64.b64encode(body).decode(), 'metadata_mode': metadata_mode,
            'directory_mode': directory_mode, 'backups': backups}
