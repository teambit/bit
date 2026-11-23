#!/usr/bin/env python3
"""Seed real released-CLI import-adoption and dependency-graph fixtures."""
import json
import shutil
import subprocess

SCOPE = 'import-adoption-benchmark'
WORKLOADS = {
    'track-only': ['import', f'{SCOPE}/comp00', '--track-only', '--path', 'existing', '-x'],
    'empty-directory': ['import', f'{SCOPE}/comp00', '--write-to-empty-dir', '-x'],
    'dependents': ['import', f'{SCOPE}/comp02', '--dependents', '--silent', '-x'],
    'dependents-via': ['import', f'{SCOPE}/comp02', '--dependents-via', f'{SCOPE}/comp01', '--silent', '-x'],
    'write-workspace-deps': ['import', f'{SCOPE}/comp01', '--write-deps', 'workspace.jsonc', '-x'],
    'write-package-deps': ['import', f'{SCOPE}/comp01', '--write-deps', 'package.json', '-x'],
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
    clean = stage / 'clean'
    shutil.copytree(workspace, clean, symlinks=True)
    graph = {0: [1, 3], 1: [2], 3: [2]}
    for index in range(4):
        component = workspace / f'comp{index:02}'
        component.mkdir()
        imports = ''.join(f"require('@{SCOPE}/comp{dependency:02}');\n"
                          for dependency in graph.get(index, []))
        (component / 'index.js').write_text(imports + f'module.exports = {index};\n')
        for companion in range(10):
            (component / f'file-{companion}.js').write_text(
                f'module.exports = {index * 100 + companion};\n')
        run('add', component.name, '--id', component.name)
    run('link')
    run('tag', '--ignore-issues', '*', '--message', 'import adoption benchmark baseline')
    run('export')
    exported = stage / 'exported'
    shutil.copytree(workspace, exported, symlinks=True)
    baselines, remotes = {}, {}
    for name in WORKLOADS:
        shutil.rmtree(workspace)
        shutil.copytree(clean, workspace, symlinks=True)
        if name == 'track-only':
            shutil.copytree(exported / 'comp00', workspace / 'existing')
            (workspace / 'existing/file-0.js').write_text('module.exports = "local edits";\n')
        elif name == 'empty-directory':
            run('import', f'{SCOPE}/comp00', '-x')
            raw = (workspace / '.bitmap').read_text()
            bitmap = json.loads(raw[raw.index('{'):])
            row = next(value for value in bitmap.values()
                       if isinstance(value, dict) and value.get('scope') == SCOPE)
            directory = row['rootDir']
            shutil.rmtree(workspace)
            shutil.copytree(clean, workspace, symlinks=True)
            occupied = workspace / directory
            occupied.mkdir(parents=True)
            (occupied / 'untouched.txt').write_text('preexisting untracked directory\n')
            first = workspace / (directory + '_1')
            first.mkdir(parents=True)
            (first / 'untouched.txt').write_text('preexisting first increment\n')
        else:
            run('import', f'{SCOPE}/comp00', '-x')
        baseline = stage / f'baseline-{name}'
        remote_baseline = stage / f'baseline-remote-{name}'
        shutil.copytree(workspace, baseline, symlinks=True)
        shutil.copytree(remote, remote_baseline, symlinks=True)
        baselines[name], remotes[name] = baseline, remote_baseline
    home, globals_directory = stage / 'baseline-home', stage / 'baseline-globals'
    shutil.copytree(stage / 'home', home, symlinks=True)
    shutil.copytree(stage / 'globals', globals_directory, symlinks=True)
    return baselines, remotes, home, globals_directory
