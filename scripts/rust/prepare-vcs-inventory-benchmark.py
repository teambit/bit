#!/usr/bin/env python3
"""Seed seven immutable list/cat fixtures with published Bit 2.2.94 outside timing.

The file remote is always ``stage/remote``. Every timed replay restores that
same absolute directory, so scope.json's configured file URL never changes.
Seed tags/snaps ignore only fixture installation issues outside the measured
commands; actual list/cat calls never receive ignore flags.
"""
import json
from pathlib import Path
import shutil
import subprocess

SCOPE = 'inventory-benchmark'
WORKLOADS = {
    'local-outdated-json': ['list', '--json', '--outdated'],
    'remote-deleted-json': ['list', SCOPE, '--json', '--include-deleted'],
    'remote-deleted-table': ['list', SCOPE, '--include-deleted'],
    'cat-current-changes': ['cat', 'bar/foo', '--json'],
    'cat-historical': ['cat', 'bar/foo@0.0.1', '--json'],
    'cat-config-all': ['cat', 'bar/foo', '--all', '--json'],
    'cat-cold-documentation': ['cat', 'bar/foo', '--json'],
}


def seed(args, stage, environment):
    workspace, remote = stage / 'workspace', stage / 'remote'
    workspace.mkdir()
    remote.mkdir()
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
    run('init', '--standalone', '--no-package-json')
    scope_file = workspace / '.bit/scope.json'
    scope = json.loads(scope_file.read_text())
    scope['remotes'] = {SCOPE: remote.as_uri()}
    scope_file.write_text(json.dumps(scope, indent=4))
    (workspace / 'workspace.jsonc').write_text(json.dumps({
        'teambit.workspace/workspace': {'name': SCOPE, 'defaultScope': SCOPE},
        'teambit.preview/preview': {'disabled': True}}))
    # An installed, entirely local package gives CatCmd a real dependency
    # manifest without fetching a registry package during fixture creation.
    (workspace / 'package.json').write_text(json.dumps({
        'name': 'inventory-benchmark', 'version': '1.0.0',
        'dependencies': {'inventory-dep': '1.2.3'}}))
    package = workspace / 'node_modules/inventory-dep'
    package.mkdir(parents=True)
    (package / 'package.json').write_text(json.dumps({'name': 'inventory-dep', 'version': '1.2.3'}))
    (package / 'index.js').write_text('module.exports = 17;\n')

    foo = workspace / 'bar'
    foo.mkdir()
    (foo / 'foo.js').write_text("module.exports = require('inventory-dep');\n")
    (foo / 'old.js').write_text("module.exports = 'old';\n")
    run('add', 'bar', '-i', 'bar/foo', '--main', 'foo.js')
    for directory, name in [('ui', 'button'), ('legacy', 'old')]:
        component = workspace / directory
        component.mkdir()
        (component / 'index.js').write_text(f"module.exports = '{name}';\n")
        run('add', directory, '-i', f'{directory}/{name}')
    for name in ['bar/foo', 'ui/button', 'legacy/old']:
        run('tag', name, '--ver', '0.0.1', '--ignore-issues', '*', '--message', 'inventory baseline')
    run('export')
    stale = stage / 'seed-stale-workspace'
    shutil.copytree(workspace, stale, symlinks=True)

    (foo / 'foo.js').write_text("module.exports = require('inventory-dep') + 2;\n")
    run('tag', 'bar/foo', '--ver', '0.0.2', '--ignore-issues', '*', '--message', 'remote advance')
    run('export')
    (foo / 'foo.js').write_text("module.exports = require('inventory-dep') + 3;\n")
    (foo / 'new.js').write_text("module.exports = 'new';\n")
    (foo / 'old.js').unlink()
    cat_workspace = stage / 'seed-cat-workspace'
    shutil.copytree(workspace, cat_workspace, symlinks=True)

    # Remote metadata is produced by released commands. The read-only list
    # benchmarks must show both a soft-deleted and a deprecated component.
    run('deprecate', 'legacy/old')
    run('snap', '--message', 'deprecated', '--ignore-issues', '*')
    run('export')
    run('delete', 'ui/button', '--silent')
    run('snap', '--message', 'removed', '--ignore-issues', '*')
    run('export')

    listed = json.loads(run('list', SCOPE, '--json', '--include-deleted'))
    if not any(row['id'] == f'{SCOPE}/ui/button' and row.get('removed') is True for row in listed):
        raise RuntimeError('released remote fixture has no removed component')
    if not any(row['id'] == f'{SCOPE}/legacy/old' and row.get('deprecated') is True for row in listed):
        raise RuntimeError('released remote fixture has no deprecated component')
    cat = json.loads(run('cat', 'bar/foo', '--all', '--json', cwd=cat_workspace))
    if not cat.get('config', {}).get('dependencies', {}).get('inventory-dep'):
        raise RuntimeError('released CatCmd did not detect the real package dependency')
    files = {row['path']: row['content'] for row in cat['files']}
    if 'new.js' not in files or 'old.js' in files or '+ 3' not in files['foo.js']:
        raise RuntimeError('released CatCmd did not observe edited/added/deleted workspace files')
    old = json.loads(run('cat', 'bar/foo@0.0.1', '--json', cwd=cat_workspace))
    if '+ 3' in ''.join(row['content'] for row in old['files']):
        raise RuntimeError('released historical CatCmd returned current workspace files')
    outdated = json.loads(run('list', '--json', '--outdated', cwd=stale))
    if not any(row['id'] == f'{SCOPE}/bar/foo' and
               row['remoteVersion'] not in (None, 'N/A') and
               row['localVersion'] != row['remoteVersion']
               for row in outdated):
        raise RuntimeError('released list fixture has no remote-advanced version')

    rich_workspace = stage / 'seed-cat-rich-workspace'
    shutil.copytree(cat_workspace, rich_workspace, symlinks=True)
    rich_source = (
        '/**\n * A documented function.\n * @name answer\n * @public\n'
        ' * @returns {number} number\n */\n'
        'module.exports = function answer() { return 42; };\n')
    (rich_workspace / 'bar/foo.js').write_text(rich_source)
    rich = json.loads(run('cat', 'bar/foo', '--json', cwd=rich_workspace))
    if not any(row['path'] == 'foo.js' and row['content'] == rich_source for row in rich['files']):
        raise RuntimeError('released CatCmd did not load the cold documentation fixture')

    sources = {name: rich_workspace if name == 'cat-cold-documentation' else
               stale if name == 'local-outdated-json' else
               cat_workspace if name.startswith('cat-') else workspace
               for name in WORKLOADS}
    baselines, remotes = {}, {}
    for name, source in sources.items():
        baseline = stage / f'baseline-{name}'
        remote_baseline = stage / f'baseline-remote-{name}'
        shutil.copytree(source, baseline, symlinks=True)
        shutil.copytree(remote, remote_baseline, symlinks=True)
        baselines[name], remotes[name] = baseline, remote_baseline
    home, globals_directory = stage / 'baseline-home', stage / 'baseline-globals'
    shutil.copytree(stage / 'home', home, symlinks=True)
    shutil.copytree(stage / 'globals', globals_directory, symlinks=True)
    # `prepare-stash-benchmark.prewarm_builtin_facts` requires a disposable
    # workspace at stage/clean, never used in a timed command.
    shutil.copytree(cat_workspace, stage / 'clean', symlinks=True)
    return baselines, remotes, home, globals_directory
