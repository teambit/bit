#!/usr/bin/env python3
"""Seed released-CLI local and immutable remote fork fixtures outside timing.

Each batch has ten components with five source files each. Single-component
fixtures contain eleven source files. No package installation is measured: local
fork never installs, while remote/scope fixtures use the released -x flag.
"""
import json
import shutil
import subprocess

SCOPE = 'fork-benchmark'
WORKLOADS = {
    'local-single': ['fork', 'comp00', 'copied-component', '--preserve', '-x'],
    'local-refactor': ['fork', 'comp00', 'copied-component', '--preserve', '--refactor', '-x'],
    'local-batch': ['fork', f'{SCOPE}/**', '--scope', 'replacement.scope', '--preserve', '-x'],
    'remote-single': ['fork', f'{SCOPE}/comp00', '--scope', 'replacement.scope', '--preserve', '-x'],
    'remote-batch': ['fork', f'{SCOPE}/**', '--scope', 'replacement.scope', '-x'],
    'scope-batch': ['scope', 'fork', SCOPE, 'replacement.scope', '-x'],
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
            raise RuntimeError(f'seed {command}: {result.stdout!r} {result.stderr!r}')

    run('init', '--bare', SCOPE, cwd=remote)
    run('init', '--standalone', '--no-package-json')
    scope_file = workspace / '.bit/scope.json'
    scope = json.loads(scope_file.read_text())
    scope['remotes'] = {SCOPE: remote.as_uri()}
    scope_file.write_text(json.dumps(scope, indent=4))
    (workspace / 'workspace.jsonc').write_text(json.dumps({
        'teambit.workspace/workspace': {'name': SCOPE, 'defaultScope': SCOPE},
        'teambit.preview/preview': {'disabled': True}}))
    clean, empty_remote = stage / 'clean', stage / 'remote-empty'
    shutil.copytree(workspace, clean, symlinks=True)
    shutil.copytree(remote, empty_remote, symlinks=True)
    baselines, remotes = {}, {}
    for name in WORKLOADS:
        shutil.rmtree(workspace)
        shutil.copytree(clean, workspace, symlinks=True)
        shutil.rmtree(remote)
        shutil.copytree(empty_remote, remote, symlinks=True)
        count = 10 if name.endswith('batch') else 1
        for index in range(count):
            component = workspace / f'comp{index:02}'
            component.mkdir()
            (component / 'index.js').write_text(f'module.exports = {index};\n')
            companions = 4 if count > 1 else 10
            for companion in range(companions):
                (component / f'file-{companion}.js').write_text(
                    f'module.exports = {index * 100 + companion};\n')
            run('add', component.name, '--id', component.name)
        if name == 'local-refactor':
            dependent = workspace / 'dependent'
            dependent.mkdir()
            (dependent / 'index.js').write_text(
                f"module.exports = require('@{SCOPE}/comp00');\n")
            run('add', 'dependent', '--id', 'dependent')
        if name.startswith('remote-') or name == 'scope-batch':
            run('tag', '--ignore-issues', '*', '--message', 'fork benchmark baseline')
            run('export')
            raw = (workspace / '.bitmap').read_text()
            bitmap = json.loads(raw[raw.index('{'):])
            promoted = [row for row in bitmap.values() if isinstance(row, dict)
                        and row.get('scope') == SCOPE]
            if len(promoted) != count:
                raise RuntimeError('released export did not promote the complete fixture batch')
            # A fresh consumer has no local models or source files for the remote
            # components. Retain exactly the configured real file remote.
            shutil.rmtree(workspace)
            shutil.copytree(clean, workspace, symlinks=True)
        baseline = stage / f'baseline-{name}'
        remote_baseline = stage / f'baseline-remote-{name}'
        shutil.copytree(workspace, baseline, symlinks=True)
        shutil.copytree(remote, remote_baseline, symlinks=True)
        baselines[name], remotes[name] = baseline, remote_baseline
    home, globals_directory = stage / 'baseline-home', stage / 'baseline-globals'
    shutil.copytree(stage / 'home', home, symlinks=True)
    shutil.copytree(stage / 'globals', globals_directory, symlinks=True)
    return baselines, remotes, home, globals_directory
