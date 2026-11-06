#!/usr/bin/env python3
"""Untimed released-CLI checkout transcripts for fixed lane-history restoration workloads.

Historical checkout publishes one checkout bitmap transition; revert-only phases
preserve bitmap versions and emit none. The immutable transcript records the actual
released preimage. Timed clocks and commands are untouched, and every surviving
last-writer backup is validated.
"""
import base64
import importlib.util
import json
from pathlib import Path
import shutil
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


CORE = load('lane_oracle_core', 'prepare-bitmap-history-oracle.py')
FIXTURE = load('lane_oracle_fixture', 'prepare-lane-restoration-benchmark.py')
COMMON = load('lane_oracle_common', 'bench-stash.py')
VALIDATOR = load('lane_oracle_validator', 'bitmap-history-oracle.py')
WORKLOADS = tuple(FIXTURE.HISTORY_REASONS)


def sources(fixtures, workload):
    return {'workspace': Path(fixtures['workloads'][workload]),
            'remote': Path(fixtures['remotes'][workload]),
            'home': Path(fixtures['home']), 'globals': Path(fixtures['globals'])}


def prepare(args, stage, fixtures, environment):
    if not args.prepare_only:
        raise RuntimeError('lane bitmap transcripts require explicit --prepare-only')
    references = dict(fixtures.get('lane_bitmap_history_oracles', {}))
    for workload in WORKLOADS:
        destination = stage / f'lane-{workload}-bitmap-history-oracle.json'
        if workload in references:
            frozen(fixtures, workload)
            continue
        if destination.exists():
            raise RuntimeError(f'refusing to replace an unbound existing oracle: {destination}')
        record = prepare_one(args, stage, fixtures, environment, workload)
        destination.write_text(json.dumps(record, indent=2) + '\n')
        references[workload] = {'path': str(destination), 'sha256': CORE.sha(destination.read_bytes())}
        # Bind each successful preparation immediately; a later failure cannot orphan a success.
        fixtures['lane_bitmap_history_oracles'] = references
        (stage / 'fixtures.json').write_text(json.dumps(fixtures, indent=2) + '\n')
    return references


def frozen(fixtures, workload):
    reference = fixtures['lane_bitmap_history_oracles'][workload]
    path = Path(reference['path'])
    if path.is_symlink() or not path.is_file() or CORE.sha(path.read_bytes()) != reference['sha256']:
        raise RuntimeError(f'frozen lane bitmap oracle changed: {workload}')
    record = json.loads(path.read_text())
    if record['workload'] != workload or record['cli_arguments'] != fixtures['commands'][workload]:
        raise RuntimeError('lane bitmap oracle workload/command mismatch')
    actual = {key: CORE.fingerprint(value) for key, value in sources(fixtures, workload).items()}
    if record['fixture_sha256'] != actual:
        raise RuntimeError('lane bitmap oracle baseline inputs changed')
    validate_rows(record['transitions'], workload)
    return record


def prepare_one(args, stage, fixtures, environment, workload):
    baseline_sources = sources(fixtures, workload)
    before = {key: CORE.fingerprint(path) for key, path in baseline_sources.items()}
    with tempfile.TemporaryDirectory(prefix='lane-bitmap-oracle-', dir=stage.parent) as temporary:
        private = Path(temporary)
        saved, touched = {}, []
        try:
            for key, source in baseline_sources.items():
                mutable = stage / key
                if source.resolve() == mutable or mutable in source.resolve().parents:
                    raise RuntimeError('lane baseline aliases mutable replay path')
                if mutable.is_symlink():
                    raise RuntimeError(f'unsafe mutable replay path: {mutable}')
                if mutable.exists():
                    saved[key] = CORE.fingerprint(mutable)
                    mutable.rename(private / key)
                touched.append(key)
                shutil.copytree(source, mutable, symlinks=True)
            record = observe(args, stage, private, environment, workload, before, fixtures)
        finally:
            for key in reversed(touched):
                mutable = stage / key
                if mutable.exists():
                    shutil.rmtree(mutable)
                if key in saved:
                    (private / key).rename(mutable)
                    if CORE.fingerprint(mutable) != saved[key]:
                        raise RuntimeError(f'lane mutable restoration changed: {key}')
            for key, source in baseline_sources.items():
                if CORE.fingerprint(source) != before[key]:
                    raise RuntimeError(f'lane immutable fixture changed: {key}')
    return record


def observe(args, stage, private, environment, workload, fixture_hashes, fixtures):
    hook = Path(__file__).with_name('scope-bitmap-history-oracle.cjs').resolve()
    node, cli = Path(args.node_binary).resolve(), Path(args.node_cli).resolve()
    if subprocess.check_output([str(node), '--version'], text=True).strip() != 'v22.22.0':
        raise RuntimeError('lane bitmap oracle requires Node22.22.0')
    package = cli.parent.parent
    if json.loads((package / 'package.json').read_text())['version'] != '2.2.94':
        raise RuntimeError('lane bitmap oracle requires Bit2.2.94')
    env = dict(environment)
    env.update(HOME=str(stage / 'home'), USERPROFILE=str(stage / 'home'),
               BIT_GLOBALS_DIR=str(stage / 'globals'), BIT_NATIVE='off', BIT_NATIVE_QUIET='1',
               BITMAP_HISTORY_ORACLE_DIRECTORY=str(private),
               BITMAP_HISTORY_ORACLE_ROOT=str(stage / 'workspace'),
               BITMAP_HISTORY_ORACLE_PACKAGE=str(package))
    command = [str(node), '--require', str(hook), str(cli), *fixtures['commands'][workload]]
    baseline = COMMON.STATE.bitmap_history(stage / 'workspace')
    provenance = fingerprints(args, hook)
    started = time.time_ns()
    output = subprocess.run(command, cwd=stage / 'workspace', env=env, capture_output=True, timeout=300)
    ended = time.time_ns()
    evidence = stage / f'lane-{workload}-bitmap-oracle-evidence'
    evidence.mkdir(exist_ok=False)
    (evidence / 'stdout').write_bytes(output.stdout)
    (evidence / 'stderr').write_bytes(output.stderr)
    journal = private / 'transitions.jsonl'
    if journal.exists():
        (evidence / 'transitions.jsonl').write_bytes(journal.read_bytes())
    if output.returncode:
        raise RuntimeError(f'released lane bitmap preparation failed: {evidence}')
    transitions = [json.loads(line) for line in journal.read_text().splitlines()]
    validate_rows(transitions, workload)
    final = (stage / 'workspace/.bitmap').read_bytes()
    record = {'workload': workload, 'cli_arguments': fixtures['commands'][workload],
              'transitions': transitions, 'final_bitmap_sha256': CORE.sha(final),
              'raw_history': CORE.raw_history(stage / 'workspace'), 'command': command,
              'evidence': str(evidence), 'fixture_sha256': fixture_hashes, **provenance}
    _, raw = VALIDATOR.validate(stage / 'workspace', baseline, record, started, ended, expected_transitions=len(FIXTURE.HISTORY_REASONS[workload]))
    (evidence / 'raw-history.json').write_text(json.dumps(raw, indent=2) + '\n')
    (evidence / 'final.bitmap').write_bytes(final)
    if fingerprints(args, hook) != provenance:
        raise RuntimeError('lane oracle source/binary/helper changed during preparation')
    return record


def fingerprints(args, hook):
    return {'native_source': CORE.native_source(),
            'node_sha256': CORE.sha(Path(args.node_binary).read_bytes()),
            'cli_sha256': CORE.sha(Path(args.node_cli).read_bytes()),
            'hook_sha256': CORE.sha(hook.read_bytes()),
            'preparer_sha256': CORE.sha(Path(__file__).read_bytes()),
            'core_preparer_sha256': CORE.sha(Path(__file__).with_name('prepare-bitmap-history-oracle.py').read_bytes()),
            'fixture_helper_sha256': CORE.sha(Path(__file__).with_name('prepare-lane-restoration-benchmark.py').read_bytes()),
            'provider_fixture_sha256': CORE.sha((Path(__file__).resolve().parents[2] / 'native/cli/tests/e2e/harmony/lane_adoption/callbacks.cjs').read_bytes())}


def validate_rows(rows, workload):
    reasons = FIXTURE.HISTORY_REASONS[workload]
    if len(rows) != len(reasons) or [row.get('reason') for row in rows] != reasons:
        raise RuntimeError('unexpected released checkout/lane-switch count/order')
    for index, row in enumerate(rows):
        if row.get('sequence') != index or any(key.endswith('error') for key in row):
            raise RuntimeError(f'failed lane oracle transition: {row}')
        base64.b64decode(row['preimage_base64'], validate=True)
        if row['mode'] != row['backup_mode']:
            raise RuntimeError('lane oracle backup mode changed')
