#!/usr/bin/env python3
"""Prepare immutable released-CLI lane-history inputs; never invoked during timing.

Three shared baseline families avoid reseeding every presentation/pair. Every
command restores the same absolute workspace, home, globals and file remote.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zlib
sys.dont_write_bytecode = True


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ADOPTION = load('restoration_seed_adoption', 'prepare-lane-adoption-benchmark.py')
SCOPE = ADOPTION.SCOPE
WORKLOADS = {name: None for name in [
    'checkout-deleted', 'revert-existing', 'restore-deleted', 'restore-json',
    'remote-history-refresh', 'missing-history', 'main-history', 'provider-default-install']}
INSTALLATIONS = {'provider-default-install'}
PROVIDERS = INSTALLATIONS
ERRORS = {'missing-history', 'main-history'}
EXPECTED_CODES = {name: (1 if name in ERRORS else 0) for name in WORKLOADS}
HISTORY_REASONS = {name: ['checkout'] for name in [
    'checkout-deleted', 'restore-deleted', 'restore-json', 'remote-history-refresh']}


def seed(args, stage, environment):
    root, remote = stage / 'workspace', stage / 'remote'
    for path in [root, remote, stage / 'home', stage / 'globals/config']:
        path.mkdir(parents=True)
    (stage / 'globals/config/config.json').write_text(json.dumps({
        'analytics_reporting': 'false', 'error_reporting': 'false',
        'user.name': 'CI', 'user.email': 'ci@bit.dev', 'log_level': 'fatal'}))

    def run(*command, cwd=root):
        output = subprocess.run([str(args.node_binary), str(args.node_cli), *command],
                                cwd=cwd, env=environment, capture_output=True, timeout=300)
        if output.returncode:
            raise RuntimeError(f'restoration preparation {command}: {output.stdout!r} {output.stderr!r}')
        return output.stdout

    run('init', '--bare', SCOPE, cwd=remote)
    run('init', '--standalone', '--no-package-json')
    scope_path = root / '.bit/scope.json'
    scope = json.loads(scope_path.read_text())
    scope['remotes'] = {SCOPE: remote.as_uri()}
    scope_path.write_text(json.dumps(scope, indent=4))
    (root / 'workspace.jsonc').write_text(json.dumps({
        'teambit.workspace/workspace': {'name': SCOPE, 'defaultScope': SCOPE},
        'teambit.preview/preview': {'disabled': True}}))
    clean, clean_remote = stage / 'clean', stage / 'clean-remote'
    ADOPTION.copy(root, clean)
    ADOPTION.copy(remote, clean_remote)
    baselines, remotes, commands, contracts = {}, {}, {}, {}

    def freeze(label, names):
        workspace, bare = stage / f'baseline-{label}', stage / f'baseline-remote-{label}'
        ADOPTION.copy(root, workspace)
        ADOPTION.copy(remote, bare)
        for name in names:
            baselines[name], remotes[name] = workspace, bare

    freeze('main', ['main-history'])
    commands['main-history'] = ['lane', 'checkout', 'missing-history', '-x']
    for name in ['comp1', 'comp2', 'comp3']:
        ADOPTION.component(root, run, name)
    run('lane', 'create', 'dev')
    run('snap', '--unmodified', '--ignore-issues', '*', '--message', 'initial')
    run('export')
    history = latest(run)
    original = versions(root)
    (root / 'comp3/index.js').write_text("module.exports='newer historical head';\n")
    run('snap', '--ignore-issues', '*', '--message', 'newer')
    run('export')
    refreshed_history = latest(run)
    (root / 'comp3/index.js').write_text("module.exports='newest historical head';\n")
    run('snap', '--ignore-issues', '*', '--message', 'newest')
    run('export')
    run('import', f'{SCOPE}/comp3', '--all-history', '-x')
    history_path, history_before = remove_history_entry(root, refreshed_history)
    freeze('refresh', ['remote-history-refresh'])
    history_path.write_bytes(history_before)
    for name in ['comp1', 'comp2']:
        run('delete', name, '--silent', '--lane')
    run('snap', '--unmodified', '--ignore-issues', '*', '--message', 'deleted')
    run('export')
    deleted_names = ['checkout-deleted', 'revert-existing', 'restore-deleted', 'restore-json', 'missing-history']
    freeze('deleted', deleted_names)
    current = versions(root)
    for name in deleted_names:
        action = 'checkout' if name == 'checkout-deleted' else 'revert'
        commands[name] = ['lane', action, history, '-x']
        contracts[name] = {'original_versions': original, 'current_versions': current}
    for name in ['restore-deleted', 'restore-json']:
        commands[name].append('--restore-deleted-components')
    commands['restore-json'].append('--json')
    commands['missing-history'] = ['lane', 'revert', 'missing-history', '-x']
    commands['remote-history-refresh'] = ['lane', 'checkout', refreshed_history, '-x']
    contracts['remote-history-refresh'] = {'expected_comp3': "module.exports='newer historical head';\n"}
    ADOPTION.reset(clean, root)
    ADOPTION.reset(clean_remote, remote)
    ADOPTION.provider_fixture(root, run, 'provider-install')
    run('switch', 'dev', '-x')
    provider_history = latest(run)
    (root / 'comp1/index.js').write_text("module.exports='provider newer snapshot';\n")
    run('snap', '--ignore-issues', '*', '--message', 'provider-newer')
    run('export')
    receipt = root / 'lane-adoption-phases.jsonl'
    if receipt.exists():
        receipt.unlink()
    freeze('provider', ['provider-default-install'])
    commands['provider-default-install'] = ['lane', 'revert', provider_history]
    contracts['provider-default-install'] = {'current_versions': versions(root)}
    home, globals_directory = stage / 'baseline-home', stage / 'baseline-globals'
    ADOPTION.copy(stage / 'home', home)
    ADOPTION.copy(stage / 'globals', globals_directory)
    (stage / 'restoration-contracts.json').write_text(json.dumps({
        'commands': commands, 'contracts': contracts}, indent=2) + '\n')
    return baselines, remotes, home, globals_directory


def latest(run):
    output = run('lane', 'history', '--json')
    for banner in [b'lane adoption configured provider started\n', b'lane adoption configured provider started\r\n']:
        if output.startswith(banner):
            output = output[len(banner):]
            break
    return json.loads(output)[-1]['id']


def versions(root):
    text = (root / '.bitmap').read_text()
    bitmap = json.loads(text[text.index('{'):])
    return {row['name']: row['version'] for row in bitmap.values()
            if isinstance(row, dict) and 'rootDir' in row}


def remove_history_entry(root, history):
    """Stale only the local LaneHistory key; retain actual populated VersionHistory."""
    scope = root / '.bit'
    index = json.loads((scope / 'index.json').read_text())
    lane = next(row['hash'] for row in index['lanes'] if row['id']['name'] == 'dev')
    digest = hashlib.sha1(f'{lane}:LaneHistory'.encode()).hexdigest()
    path = scope / 'objects' / digest[:2] / digest[2:]
    original = path.read_bytes()
    header, payload = zlib.decompress(original).split(b'\0', 1)
    if not header.startswith(f'LaneHistory {digest} '.encode()):
        raise RuntimeError('unexpected actual LaneHistory object header')
    value = json.loads(payload)
    if value['laneHash'] != lane or history not in value['history']:
        raise RuntimeError('requested refresh entry absent before local-only truncation')
    del value['history'][history]
    body = json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()
    path.write_bytes(zlib.compress(f'LaneHistory {digest} {len(body)}\0'.encode() + body))
    if history in json.loads(zlib.decompress(path.read_bytes()).split(b'\0', 1)[1])['history']:
        raise RuntimeError('local LaneHistory truncation did not take effect')
    return path, original
