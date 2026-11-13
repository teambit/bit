#!/usr/bin/env python3
"""Seed released-CLI mutation fixtures; never part of the measured interval.

Tagged remove/delete use twenty independent components. Recovery starts from the
same tagged batch after canonical local delete. Scope rename exports five of ten
chain components before renaming all ten with refactoring and deprecation. This
matches the mixed original scope regression, retaining deprecated originals.
Seed tags intentionally ignore missing fixture environment packages; measured
commands do not ignore issues. No install workload or first-use claim is made.
"""
import json
import shutil

SCOPE = 'mutation-benchmark'
WORKLOADS = {
    'remove-tagged-batch': ['remove', '**/comp*', '--silent'],
    'delete-tagged-batch': ['delete', '**/comp*', '--silent'],
    'recover-deleted-batch': ['recover', '**/comp*', '-x'],
    'scope-rename-mixed': ['scope', 'rename', SCOPE, 'replacement.scope',
                           '--refactor', '--deprecate', '-x'],
}


def seed(args, stage, environment):
    # Reuse the pinned init/remote/config setup without executing its workload
    # builder. All active operations below are the actual released CLI.
    import subprocess
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
        count = 10 if name == 'scope-rename-mixed' else 20
        for index in range(count):
            component = workspace / f'comp{index:02}'
            component.mkdir()
            text = (f"module.exports = require('@{SCOPE}/comp{index + 1:02}');\n"
                    if name == 'scope-rename-mixed' and index + 1 < count
                    else f'module.exports = {index};\n')
            (component / 'index.js').write_text(text)
            for companion in range(4):
                (component / f'file-{companion}.js').write_text(
                    f'module.exports = {index * 10 + companion};\n')
            run('add', component.name, '--id', component.name)
        if name == 'scope-rename-mixed':
            # Export the tail only: no unexported component dependencies can
            # prevent a genuine export. Head components remain new.
            for index in reversed(range(5, 10)):
                run('tag', f'comp{index:02}', '--skip-auto-tag', '--ignore-issues', '*',
                    '--message', 'mixed mutation benchmark baseline')
            run('export')
            raw = (workspace / '.bitmap').read_text()
            bitmap = json.loads(raw[raw.index('{'):])
            promoted = [row for row in bitmap.values() if isinstance(row, dict)
                        and row.get('scope') == SCOPE]
            if len(promoted) != 5:
                raise RuntimeError('mixed fixture requires exactly five exported components')
        else:
            run('tag', '--ignore-issues', '*', '--message', 'mutation benchmark baseline')
        if name == 'recover-deleted-batch':
            run('delete', '**/comp*', '--silent')
        baseline = stage / f'baseline-{name}'
        remote_baseline = stage / f'baseline-remote-{name}'
        shutil.copytree(workspace, baseline, symlinks=True)
        shutil.copytree(remote, remote_baseline, symlinks=True)
        baselines[name], remotes[name] = baseline, remote_baseline
    home, globals_directory = stage / 'baseline-home', stage / 'baseline-globals'
    shutil.copytree(stage / 'home', home, symlinks=True)
    shutil.copytree(stage / 'globals', globals_directory, symlinks=True)
    return baselines, remotes, home, globals_directory
