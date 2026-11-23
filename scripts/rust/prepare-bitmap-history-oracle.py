#!/usr/bin/env python3
"""Prepare an exact released logical bitmap-write oracle; never run in timed trials."""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile

WORKLOAD = 'scope-rename-mixed'
COMMAND = ['scope', 'rename', 'mutation-benchmark', 'replacement.scope', '--refactor', '--deprecate', '-x']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fingerprint(root):
    rows = []
    for path in [root, *sorted(root.rglob('*'))]:
        mode = path.lstat().st_mode
        item = [str(path.relative_to(root)), stat.S_IMODE(mode)]
        if path.is_symlink():
            item += ['symlink', os.readlink(path)]
        elif path.is_file():
            item += ['file', sha(path.read_bytes())]
        elif path.is_dir():
            item += ['directory']
        else:
            raise RuntimeError(f'unsupported oracle input: {path}')
        rows.append(item)
    return sha(json.dumps(rows, separators=(',', ':')).encode())


def raw_history(root):
    scope = root / '.bit'
    directory = scope / 'bitmap-history'
    metadata = scope / 'bitmap-history-metadata.txt'
    return {
        'metadata_base64': base64.b64encode(metadata.read_bytes()).decode(),
        'metadata_mode': stat.S_IMODE(metadata.stat().st_mode),
        'directory_mode': stat.S_IMODE(directory.stat().st_mode),
        'backups': {path.name: {'bytes_base64': base64.b64encode(path.read_bytes()).decode(),
                              'mode': stat.S_IMODE(path.stat().st_mode)}
                    for path in sorted(directory.iterdir())},
    }


def prepare(args, stage, fixtures, environment):
    """Temporarily replay at the real absolute stage path, then restore all mutable inputs."""
    if not getattr(args, 'prepare_only', False):
        raise RuntimeError('bitmap oracle generation requires explicit --prepare-only')
    stage = Path(stage).resolve()
    destination = stage / 'scope-bitmap-history-oracle.json'
    if destination.exists():
        raise RuntimeError('refusing to overwrite a frozen bitmap history oracle')
    sources = {'workspace': Path(fixtures['workloads'][WORKLOAD]),
               'remote': Path(fixtures['remotes'][WORKLOAD]),
               'home': Path(fixtures['home']), 'globals': Path(fixtures['globals'])}
    before = {key: fingerprint(path) for key, path in sources.items()}
    saved = {}
    touched = []
    output = None
    with tempfile.TemporaryDirectory(prefix='scope-bitmap-oracle-', dir=stage.parent) as temporary:
        private = Path(temporary)
        try:
            for key, source in sources.items():
                mutable = stage / key
                if source.resolve() == mutable or mutable in source.resolve().parents:
                    raise RuntimeError('oracle baseline aliases mutable replay path')
                if mutable.is_symlink():
                    raise RuntimeError(f'unsafe mutable oracle path: {mutable}')
                if mutable.exists():
                    original = fingerprint(mutable)
                    mutable.rename(private / key)
                    saved[key] = original
                touched.append(key)
                shutil.copytree(source, mutable, symlinks=True)
            output = run(args, stage, private, environment, before)
        finally:
            for key in reversed(touched):
                mutable = stage / key
                if mutable.exists():
                    shutil.rmtree(mutable)
                if key in saved:
                    (private / key).rename(mutable)
                    if fingerprint(mutable) != saved[key]:
                        raise RuntimeError(f'mutable input restoration changed: {key}')
            for key, source in sources.items():
                if fingerprint(source) != before[key]:
                    raise RuntimeError(f'immutable oracle fixture changed: {key}')
    destination.write_text(json.dumps(output, indent=2) + '\n')
    return output


def run(args, stage, private, environment, fixture_hashes):
    hook = Path(__file__).with_name('scope-bitmap-history-oracle.cjs').resolve()
    node = Path(args.node_binary).resolve()
    cli = Path(args.node_cli).resolve()
    package = cli.parent.parent
    if subprocess.check_output([str(node), '--version'], text=True).strip() != 'v22.22.0':
        raise RuntimeError('bitmap oracle requires pinned Node22.22.0')
    if json.loads((package / 'package.json').read_text())['version'] != '2.2.94':
        raise RuntimeError('bitmap oracle requires published Bit2.2.94')
    env = dict(environment)
    env.update(HOME=str(stage / 'home'), USERPROFILE=str(stage / 'home'),
               BIT_GLOBALS_DIR=str(stage / 'globals'), BIT_NATIVE='off',
               BITMAP_HISTORY_ORACLE_DIRECTORY=str(private),
               BITMAP_HISTORY_ORACLE_ROOT=str(stage / 'workspace'),
               BITMAP_HISTORY_ORACLE_PACKAGE=str(package))
    # A direct Node argv preload does not leak into any later measured NODE_OPTIONS.
    command = [str(node), '--require', str(hook), str(cli), *COMMAND]
    source_before = native_source()
    binary_before = {'node_sha256': sha(node.read_bytes()), 'cli_sha256': sha(cli.read_bytes()),
                     'hook_sha256': sha(hook.read_bytes()), 'preparer_sha256': sha(Path(__file__).read_bytes())}
    completed = subprocess.run(command, cwd=stage / 'workspace', env=env,
                               capture_output=True, timeout=300)
    evidence = stage / 'scope-bitmap-oracle-evidence'
    evidence.mkdir(exist_ok=False)
    (evidence / 'stdout').write_bytes(completed.stdout)
    (evidence / 'stderr').write_bytes(completed.stderr)
    journal = private / 'transitions.jsonl'
    if journal.exists():
        (evidence / 'transitions.jsonl').write_bytes(journal.read_bytes())
    if completed.returncode:
        raise RuntimeError(f'published bitmap oracle failed: {evidence}')
    transitions = [json.loads(line) for line in (private / 'transitions.jsonl').read_text().splitlines()]
    validate(transitions)
    final = (stage / 'workspace/.bitmap').read_bytes()
    history = raw_history(stage / 'workspace')
    (evidence / 'final.bitmap').write_bytes(final)
    (evidence / 'raw-history.json').write_text(json.dumps(history, indent=2) + '\n')
    if native_source() != source_before:
        raise RuntimeError('native source changed during oracle preparation')
    binary_after = {'node_sha256': sha(node.read_bytes()), 'cli_sha256': sha(cli.read_bytes()),
                    'hook_sha256': sha(hook.read_bytes()), 'preparer_sha256': sha(Path(__file__).read_bytes())}
    if binary_after != binary_before:
        raise RuntimeError('oracle executable/helper changed during preparation')
    return {'workload': WORKLOAD, 'transitions': transitions,
            'final_bitmap_sha256': sha(final), 'raw_history': history,
            'command': command, 'evidence': str(evidence),
            'fixture_sha256': fixture_hashes,
            'native_source': source_before, **binary_before}


def validate(rows):
    reasons = []
    for index in range(5, 10):
        reasons += [f'adding replacement.scope/comp{index:02}',
                    f'deprecate mutation-benchmark/comp{index:02}@0.0.1']
    reasons += ['rename'] * 5
    if len(rows) != 15 or [row.get('reason') for row in rows] != reasons:
        raise RuntimeError('unexpected published scope bitmap transition count/order')
    for index, row in enumerate(rows):
        if row.get('sequence') != index or any(key.endswith('error') for key in row):
            raise RuntimeError(f'failed oracle transition: {row}')
        base64.b64decode(row['preimage_base64'], validate=True)
        if row['mode'] != row['backup_mode']:
            raise RuntimeError('oracle backup mode changed')


def native_source():
    root = Path(__file__).resolve().parents[2]
    names = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z', 'native'], cwd=root)
    digest = hashlib.sha256()
    count = 0
    for name in sorted(set(names.split(b'\0')) - {b''}):
        path = root / os.fsdecode(name)
        if path.is_file():
            digest.update(name + b'\0' + path.read_bytes() + b'\0')
            count += 1
    return {'sha256': digest.hexdigest(), 'file_count': count,
            'producer_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()}
