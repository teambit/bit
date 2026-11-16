#!/usr/bin/env python3
"""Prepare add-only fixtures using published Node outside measurement."""
import json
import shutil
import subprocess

WORKLOADS = {
    'single': ['add', 'comp1', '--id', 'comp1'],
    'batch': ['add', 'components/*'],
    'root': ['add', '.', '--id', 'ws-root', '--root'],
    'readd': ['add', 'comp1', '--id', 'comp1', '--main', 'entry.js'],
    'ignored': ['add', 'ignored', '--id', 'ignored'],
    'link-failure': ['add', 'comp1', '--id', 'comp1'],
}


def seed(args, stage, environment):
    workspace = stage / 'workspace'
    workspace.mkdir()
    (stage / 'home').mkdir()
    config = stage / 'globals/config'
    config.mkdir(parents=True)
    (config / 'config.json').write_text(json.dumps({
        'analytics_reporting': 'false', 'error_reporting': 'false',
        'user.name': 'CI', 'user.email': 'ci@bit.dev', 'log_level': 'fatal'}))

    def run(*command, cwd=workspace):
        result = subprocess.run([str(args.node_binary), str(args.node_cli), *command],
                                cwd=cwd, env=environment, capture_output=True, timeout=120)
        if result.returncode:
            raise RuntimeError(f'seed {command}: {result.stdout!r} {result.stderr!r}')

    remote = stage / 'remote'
    remote.mkdir()
    run('init', '--bare', 'add-benchmark', cwd=remote)
    remote_baseline = stage / 'baseline-remote'
    shutil.copytree(remote, remote_baseline, symlinks=True)
    run('init', '--standalone', '--no-package-json')
    scope_file = workspace / '.bit/scope.json'
    scope = json.loads(scope_file.read_text())
    scope['remotes'] = {'add-benchmark': remote.as_uri()}
    scope_file.write_text(json.dumps(scope, indent=4))
    (workspace / 'workspace.jsonc').write_text(json.dumps({
        'teambit.workspace/workspace': {'name': 'add-benchmark', 'defaultScope': 'add-benchmark'},
        'teambit.preview/preview': {'disabled': True}}))
    clean = stage / 'clean'
    shutil.copytree(workspace, clean, symlinks=True)
    baselines = {}
    for name in WORKLOADS:
        shutil.rmtree(workspace)
        shutil.copytree(clean, workspace, symlinks=True)
        component = workspace / 'comp1'
        component.mkdir()
        (component / 'index.js').write_text("module.exports = 'base';\n")
        if name == 'batch':
            for number in range(100):
                directory = workspace / 'components' / f'component-{number:03}'
                directory.mkdir(parents=True)
                for file in range(10):
                    (directory / f'file-{file}.js').write_text(f'module.exports = {number};\n')
                (directory / 'index.js').write_text(f'module.exports = {number};\n')
        elif name == 'root':
            run('add', 'comp1')
            (workspace / 'README.md').write_text('# root\n')
        elif name == 'readd':
            run('add', 'comp1')
            (component / 'entry.js').write_text("module.exports = 'entry';\n")
        elif name == 'ignored':
            (workspace / 'ignored').mkdir()
            (workspace / 'ignored/index.js').write_text('module.exports=1;\n')
            (workspace / '.gitignore').write_text('ignored/*\n')
        elif name == 'link-failure':
            (workspace / 'node_modules').mkdir(exist_ok=True)
            (workspace / 'node_modules/@add-benchmark').write_text('blocked scope directory\n')
        destination = stage / f'baseline-{name}'
        shutil.copytree(workspace, destination, symlinks=True)
        baselines[name] = destination
    home, globals_directory = stage / 'baseline-home', stage / 'baseline-globals'
    shutil.copytree(stage / 'home', home, symlinks=True)
    shutil.copytree(stage / 'globals', globals_directory, symlinks=True)
    return baselines, home, globals_directory, remote_baseline
