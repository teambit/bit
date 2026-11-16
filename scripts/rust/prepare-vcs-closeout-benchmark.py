#!/usr/bin/env python3
"""Seed immutable closeout command fixtures with published Bit 2.2.94.

All workspaces point to the same absolute ``stage/remote`` file scope. The
runner restores that path, workspace, home and globals before every command.
Fixture creation and all export/install preparation occur outside timing.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

SCOPE = 'closeout-benchmark'
ORIGINAL = 'closeout-original'
WORKLOADS = {
    'hard-delete-exported': ['delete', f'{SCOPE}/bar/foo', '--hard', '--silent'],
    'hard-delete-historical-blocked': ['delete', f'{SCOPE}/comp2', '--hard', '--silent'],
    'hard-delete-historical-forced': ['delete', f'{SCOPE}/comp2', '--hard', '--silent', '--force'],
    'hard-delete-wildcard': ['delete', f'{SCOPE}/comp*', '--hard', '--silent', '--force'],
    'remote-lane-remove': ['lane', 'remove', f'{SCOPE}/dev', '--remote', '--silent', '--force'],
    'authored-import-install': ['import', f'{SCOPE}/bar/foo'],
    'fetch-original-scopes': ['fetch', f'{SCOPE}/alpha', '--components', '--from-original-scopes'],
    'active-lane-fetch-deps': ['import', f'{SCOPE}/comp1', f'{SCOPE}/comp2', '-x', '--fetch-deps'],
    'remote-lane-history-refresh': ['lane', 'history', '--json'],
    'staged-deprecation-log-file': ['log-file', 'bar/index.js'],
    'staged-deprecation-blame': ['blame', 'bar/index.js'],
}
# removeTemplate reports blocked dependents with exit zero in the released CLI.
CORRECTNESS_ONLY = {'hard-delete-historical-blocked'}
HARD_DELETE = {name for name in WORKLOADS if name.startswith('hard-delete-')}
COMPANION_TOOLING = ['shared-group-export', 'subscriber-fork', 'subscriber-switch',
                     'active-lane-provider-import', 'lane-soft-tag']


def seed(args, stage, environment):
    workspace, remote = stage / 'workspace', stage / 'remote'
    original_remote = stage / 'remote-original'
    workspace.mkdir()
    remote.mkdir()
    original_remote.mkdir()
    (stage / 'home').mkdir()
    config = stage / 'globals/config'
    config.mkdir(parents=True)
    (config / 'config.json').write_text(json.dumps({
        'analytics_reporting': 'false', 'error_reporting': 'false',
        'user.name': 'CI', 'user.email': 'ci@bit.dev', 'log_level': 'fatal'}))

    def run(*command, cwd=workspace):
        result = subprocess.run([str(args.node_binary), str(args.node_cli), *command],
                                cwd=cwd, env=environment, capture_output=True, timeout=300)
        if result.returncode:
            raise RuntimeError(f'published seed {command}: {result.stdout!r} {result.stderr!r}')
        return result.stdout

    run('init', '--bare', SCOPE, cwd=remote)
    run('init', '--bare', ORIGINAL, cwd=original_remote)
    run('init', '--standalone', '--no-package-json')
    scope_file = workspace / '.bit/scope.json'
    scope = json.loads(scope_file.read_text())
    scope['remotes'] = {SCOPE: remote.as_uri()}
    scope_file.write_text(json.dumps(scope, indent=4))
    (workspace / 'workspace.jsonc').write_text(json.dumps({
        'teambit.workspace/workspace': {'name': SCOPE, 'defaultScope': SCOPE},
        'teambit.preview/preview': {'disabled': True},
        'teambit.component/issues': {'ignoreIssues': ['MissingManuallyConfiguredPackages']}}))
    clean, empty_remote = stage / 'clean', stage / 'remote-empty'
    empty_original = stage / 'remote-original-empty'
    shutil.copytree(workspace, clean, symlinks=True)
    shutil.copytree(remote, empty_remote, symlinks=True)
    shutil.copytree(original_remote, empty_original, symlinks=True)

    def component(directory, name, source):
        path = workspace / directory
        path.mkdir()
        (path / 'index.js').write_text(source)
        run('add', directory, '-i', name)

    def tagged_pair():
        component('comp2', 'comp2', "module.exports = () => 'dependency';\n")
        component('comp1', 'comp1',
                  "const comp2 = require('../comp2');\n"
                  "module.exports = () => `dependent and ${comp2()}`;\n")
        # Match the published historical-dependency fixture: a relative
        # component import is resolved and compiled before the first tag.
        run('link', '--rewire')
        run('compile')
        run('tag', '--ignore-issues', '*', '--message', 'dependent baseline')
        run('export')

    baselines, remotes, originals = {}, {}, {}
    for name in WORKLOADS:
        shutil.rmtree(workspace)
        shutil.copytree(clean, workspace, symlinks=True)
        shutil.rmtree(remote)
        shutil.copytree(empty_remote, remote, symlinks=True)
        shutil.rmtree(original_remote)
        shutil.copytree(empty_original, original_remote, symlinks=True)
        if name in {'hard-delete-exported', 'remote-lane-remove',
                    'authored-import-install', 'remote-lane-history-refresh',
                    'staged-deprecation-log-file', 'staged-deprecation-blame'}:
            component('bar', 'bar/foo', "module.exports = 'published';\n")
            run('tag', 'bar/foo', '--ignore-issues', '*', '--message', 'baseline')
            run('export')
        elif name != 'fetch-original-scopes':
            tagged_pair()
        if name == 'fetch-original-scopes':
            scope = json.loads(scope_file.read_text())
            scope['remotes'][ORIGINAL] = original_remote.as_uri()
            scope_file.write_text(json.dumps(scope, indent=4))
            settings = workspace / 'workspace.jsonc'
            settings_text = settings.read_text().replace(SCOPE, ORIGINAL)
            settings.write_text(settings_text)
            component('comp1', 'comp1', "module.exports = 'original';\n")
            run('tag', '--ignore-issues', '*', '--message', 'original dependency')
            run('export')
            shutil.rmtree(workspace)
            shutil.copytree(clean, workspace, symlinks=True)
            scope = json.loads(scope_file.read_text())
            scope['remotes'][ORIGINAL] = original_remote.as_uri()
            scope_file.write_text(json.dumps(scope, indent=4))
            run('import', f'{ORIGINAL}/comp1', '-x')
            component('alpha', 'alpha',
                      f"module.exports = require('../{ORIGINAL}/comp1');\n")
            run('link', '--rewire')
            run('compile')
            run('tag', 'alpha', '--ignore-issues', '*', '--message', 'dependent')
            run('export')
            # Match the strict fixture's published server writer, including cached dependencies.
            writer = Path(__file__).resolve().parents[2] / 'native/cli/tests/e2e/helper/publish_objects.js'
            seeded = subprocess.run([str(args.node_binary), str(writer), str(args.node_cli),
                                     str(workspace / '.bit'), str(remote), 'null', '[]'],
                                    cwd=workspace, env=environment, capture_output=True, timeout=300)
            if seeded.returncode:
                raise RuntimeError(f'published remote writer: {seeded.stdout!r} {seeded.stderr!r}')
            model = hashlib.sha1(f'{ORIGINAL}/comp1'.encode()).hexdigest()
            cached = remote / 'objects' / model[:2] / model[2:]
            if not cached.is_file():
                raise RuntimeError('dependent remote did not cache original model')
            cached.unlink()
            shutil.rmtree(workspace)
            shutil.copytree(clean, workspace, symlinks=True)
            scope = json.loads(scope_file.read_text())
            scope['remotes'][ORIGINAL] = original_remote.as_uri()
            scope_file.write_text(json.dumps(scope, indent=4))
        if name.startswith('staged-deprecation-'):
            run('deprecate', 'bar/foo')
        elif name.startswith('hard-delete-historical-'):
            (workspace / 'comp1/index.js').write_text(
                "module.exports = () => 'independent';\n")
            run('tag', 'comp1', '--ignore-issues', '*', '--message', 'independent head')
            run('export')
        elif name == 'remote-lane-remove':
            run('lane', 'create', 'dev')
            run('snap', '--unmodified', '--message', 'lane')
            run('export')
        elif name == 'remote-lane-history-refresh':
            run('lane', 'create', 'dev')
            run('snap', '--unmodified', '--message', 'remote history')
            run('export')
            index = json.loads((workspace / '.bit/index.json').read_text())
            lane_hash = next(row['hash'] for row in index['lanes']
                             if row['id']['name'] == 'dev')
            history_hash = hashlib.sha1(f'{lane_hash}:LaneHistory'.encode()).hexdigest()
            local_history = (workspace / '.bit/objects' / history_hash[:2]
                             / history_hash[2:])
            if not local_history.is_file():
                raise RuntimeError('published lane history was not seeded')
            local_history.unlink()
        elif name == 'authored-import-install':
            bitmap = (workspace / '.bitmap').read_bytes()
            shutil.rmtree(workspace)
            shutil.copytree(clean, workspace, symlinks=True)
            (workspace / '.bitmap').write_bytes(bitmap)
        elif name == 'active-lane-fetch-deps':
            run('lane', 'create', 'dev')
            source = workspace / 'comp1/index.js'
            source.write_text(source.read_text() + "\n// lane dependency version\n")
            run('snap', 'comp1', '--message', 'lane dependency version')
            run('export')
            run('switch', 'main', '--skip-fetch', '-x')
            old = stage / 'lane-old'
            shutil.copytree(workspace, old, symlinks=True)
            (workspace / 'comp2/index.js').write_text(
                "module.exports = () => 'new main dependency';\n")
            run('tag', 'comp2', '--ignore-issues', '*', '--message', 'main update')
            run('export')
            shutil.rmtree(workspace)
            shutil.copytree(old, workspace, symlinks=True)
            run('switch', 'dev', '--skip-fetch', '-x')
        baseline = stage / f'baseline-{name}'
        remote_baseline = stage / f'baseline-remote-{name}'
        original_baseline = stage / f'baseline-original-{name}'
        shutil.copytree(workspace, baseline, symlinks=True)
        shutil.copytree(remote, remote_baseline, symlinks=True)
        shutil.copytree(original_remote, original_baseline, symlinks=True)
        baselines[name], remotes[name] = baseline, remote_baseline
        originals[name] = original_baseline
    home, globals_directory = stage / 'baseline-home', stage / 'baseline-globals'
    shutil.copytree(stage / 'home', home, symlinks=True)
    shutil.copytree(stage / 'globals', globals_directory, symlinks=True)
    return baselines, remotes, originals, home, globals_directory
