#!/usr/bin/env python3
"""Prepare identity lifecycle workloads using the pinned released CLI, outside timing."""
import json
import shutil
import subprocess

WORKLOADS = {
    'move': ['move', 'comp1', 'moved/comp1'],
    'deprecate-batch': ['deprecate', '**'],
    'rename-new': ['rename', 'comp1', 'renamed-component'],
    'rename-exported': ['rename', 'comp1', 'renamed-component', '--deprecate'],
    'rename-exported-refactor': ['rename', 'comp1', 'renamed-component', '--refactor'],
}


def seed(args, stage, environment):
    workspace = stage / 'workspace'
    workspace.mkdir()
    (stage / 'home').mkdir()
    configuration = stage / 'globals/config'
    configuration.mkdir(parents=True)
    (configuration / 'config.json').write_text(json.dumps({
        'analytics_reporting': 'false', 'error_reporting': 'false',
        'user.name': 'CI', 'user.email': 'ci@bit.dev', 'log_level': 'fatal'}))

    def run(*command, cwd=workspace):
        output = subprocess.run([str(args.node_binary), str(args.node_cli), *command],
                                cwd=cwd, env=environment, capture_output=True, timeout=300)
        if output.returncode:
            raise RuntimeError(f'seed {command}: {output.stdout!r} {output.stderr!r}')

    remote = stage / 'remote'
    remote.mkdir()
    run('init', '--bare', 'identity-benchmark', cwd=remote)
    run('init', '--standalone', '--no-package-json')
    scope_path = workspace / '.bit/scope.json'
    scope = json.loads(scope_path.read_text())
    scope['remotes'] = {'identity-benchmark': remote.as_uri()}
    scope_path.write_text(json.dumps(scope, indent=4))
    (workspace / 'workspace.jsonc').write_text(json.dumps({
        'teambit.workspace/workspace': {'name': 'identity-benchmark',
                                       'defaultScope': 'identity-benchmark'},
        'teambit.preview/preview': {'disabled': True}}))
    clean = stage / 'clean'
    shutil.copytree(workspace, clean, symlinks=True)
    empty_remote = stage / 'remote-empty'
    shutil.copytree(remote, empty_remote, symlinks=True)
    baselines, remotes = {}, {}
    for name in WORKLOADS:
        shutil.rmtree(workspace)
        shutil.copytree(clean, workspace, symlinks=True)
        shutil.rmtree(remote)
        shutil.copytree(empty_remote, remote, symlinks=True)
        if name == 'deprecate-batch':
            for index in range(100):
                component = workspace / 'components' / f'component-{index:03}'
                component.mkdir(parents=True)
                (component / 'index.js').write_text(f'module.exports = {index};\n')
            run('add', 'components/*')
        else:
            component = workspace / 'comp1'
            component.mkdir()
            (component / 'index.js').write_text("module.exports = 'identity';\n")
            for index in range(10):
                (component / f'file-{index}.js').write_text(f'module.exports = {index};\n')
            run('add', 'comp1', '--id', 'comp1')
        if name == 'rename-exported-refactor':
            dependent = workspace / 'comp2'
            dependent.mkdir()
            (dependent / 'index.js').write_text("module.exports = require('@identity-benchmark/comp1');\n")
            run('add', 'comp2', '--id', 'comp2')
        if name == 'deprecate-batch' or name.startswith('rename-exported'):
            run('tag', '--ignore-issues', '*', '--message', 'identity benchmark fixture')
        if name.startswith('rename-exported'):
            run('export')
            raw_bitmap = (workspace / '.bitmap').read_text()
            bitmap = json.loads(raw_bitmap[raw_bitmap.index('{'):])
            if not bitmap['comp1'].get('scope'):
                raise RuntimeError('released export did not promote the fixture component')
        baseline = stage / f'baseline-{name}'
        remote_baseline = stage / f'baseline-remote-{name}'
        shutil.copytree(workspace, baseline, symlinks=True)
        shutil.copytree(remote, remote_baseline, symlinks=True)
        baselines[name], remotes[name] = baseline, remote_baseline
    home, globals_directory = stage / 'baseline-home', stage / 'baseline-globals'
    shutil.copytree(stage / 'home', home, symlinks=True)
    shutil.copytree(stage / 'globals', globals_directory, symlinks=True)
    return baselines, remotes, home, globals_directory
