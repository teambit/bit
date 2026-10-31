#!/usr/bin/env python3
"""Prepare disposable transfer benchmark fixtures with the pinned published Node CLI."""
import argparse
import json
import os
import re
from pathlib import Path
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True, help='new directory outside a workspace')
    parser.add_argument('--node', type=Path, required=True, help='published CLI executable or wrapper')
    args = parser.parse_args()
    root = args.directory.resolve()
    root.mkdir()
    (root / 'home').mkdir()
    (root / 'globals/config').mkdir(parents=True)
    (root / 'globals/config/config.json').write_text(json.dumps({
        'analytics_reporting': 'false', 'error_reporting': 'false',
        'user.name': 'CI', 'user.email': 'ci@bit.dev'}))
    environment = os.environ.copy()
    for key in ['BIT_NATIVE', 'CI', 'BIT_NATIVE_TRACE']:
        environment.pop(key, None)
    environment.update(HOME=str(root / 'home'), USERPROFILE=str(root / 'home'),
                       BIT_GLOBALS_DIR=str(root / 'globals'), NODE_NO_WARNINGS='1')

    def run(cwd, *command):
        output = subprocess.run([str(args.node.resolve()), *command], cwd=cwd, env=environment,
                                capture_output=True, text=True, check=False)
        if output.returncode:
            raise RuntimeError(f'{command}: {output.stdout}\n{output.stderr}')

    def init(name, bare=False):
        path = root / name
        path.mkdir()
        run(path, 'init', *(['--bare'] if bare else ['--no-package-json']))
        if not bare:
            (path / 'workspace.jsonc').write_text(json.dumps({
                'teambit.workspace/workspace': {'name': 'transfer', 'defaultScope': 'transfer-remote',
                                               'defaultDirectory': '{scope}/{name}'},
                'teambit.preview/preview': {'disabled': True},
                'teambit.component/issues': {'ignoreIssues': ['MissingManuallyConfiguredPackages']}}))
            file = path / '.bit/scope.json'
            scope = json.loads(file.read_text())
            scope['remotes'] = {'transfer-remote': (root / 'transfer-remote').as_uri()}
            file.write_text(json.dumps(scope, indent=4))
        return path

    remote = init('transfer-remote', True)
    shutil.copytree(remote, root / 'remote-empty', symlinks=True)
    workspace = init('author')
    (workspace / 'bar').mkdir()
    (workspace / 'bar/foo.js').write_text("module.exports = 'transfer';\n")
    run(workspace, 'add', 'bar', '-i', 'bar/foo')
    for index in range(3):
        (workspace / 'bar/foo.js').write_text(f"module.exports = 'transfer-{index}';\n")
        run(workspace, 'tag', 'bar/foo', '--message', f'version{index}')
    shutil.copytree(workspace, root / 'export-main', symlinks=True)
    run(workspace, 'export')
    shutil.copytree(remote, root / 'remote-main', symlinks=True)
    consumer = init('import-main')
    shutil.copytree(consumer, root / 'fetch-main', symlinks=True)
    run(workspace, 'lane', 'create', 'dev')
    (workspace / 'bar/foo.js').write_text("module.exports = 'lane';\n")
    run(workspace, 'snap', '--message', 'lane')
    shutil.copytree(workspace, root / 'export-lane', symlinks=True)
    run(workspace, 'export')
    shutil.copytree(remote, root / 'remote-lane', symlinks=True)
    hub = root / 'export-hub'
    shutil.copytree(root / 'export-main', hub, symlinks=True)
    configuration = hub / '.bit/scope.json'
    value = json.loads(configuration.read_text())
    value['remotes'] = {}
    configuration.write_text(json.dumps(value, indent=4))
    (root / 'hub.json').write_text(json.dumps({
        'scopes': {'transfer-remote': str(remote)}, 'mode': 'success'}))

    callback = root / 'callback-author'
    shutil.copytree(root / 'import-main', callback, symlinks=True)

    def set_environment(component, identity):
        bitmap = callback / '.bitmap'
        # Published .bitmap JSON is preceded by generated block comments.
        text = re.sub(r'/\*.*?\*/', '', bitmap.read_text(), flags=re.S)
        value = json.loads(text)
        value[component]['config'] = {
            identity: {}, 'teambit.envs/envs': {'env': identity}}
        bitmap.write_text(json.dumps(value, indent=4))

    (callback / 'bar').mkdir()
    (callback / 'bar/foo.js').write_text("module.exports = 'callback';\n")
    run(callback, 'add', 'bar', '-i', 'bar/foo')
    source = (Path(__file__).resolve().parents[2] /
              'native/cli/tests/e2e/harmony/export_callbacks/aspect.cjs').read_text()
    (callback / 'export-env').mkdir()
    (callback / 'export-env/index.js').write_text(source)
    run(callback, 'add', 'export-env', '-i', 'env/export')
    set_environment('env/export', 'teambit.envs/env')
    run(callback, 'link')
    (callback / 'export-env/dist').mkdir(exist_ok=True)
    (callback / 'export-env/dist/index.js').write_text(source)
    run(callback, 'tag', 'env/export', '-m', 'environment')
    set_environment('bar/foo', 'transfer-remote/env/export')
    configuration = callback / 'workspace.jsonc'
    value = json.loads(configuration.read_text())
    value['transfer-remote/env/export'] = {}
    configuration.write_text(json.dumps(value))
    run(callback, 'tag', 'bar/foo', '-m', 'component')
    (callback / 'export-active').write_text('active')
    shutil.copytree(callback, root / 'export-callback', symlinks=True)
    report = {'root': str(root), 'environment': {key: environment[key] for key in
              ['HOME', 'USERPROFILE', 'BIT_GLOBALS_DIR', 'NODE_NO_WARNINGS']},
              'remote': str(remote), 'workloads': [
                  {'source': 'export-main', 'remote_baseline': 'remote-empty', 'command': ['export']},
                  {'source': 'export-lane', 'remote_baseline': 'remote-main', 'command': ['export']},
                  {'source': 'import-main', 'remote_baseline': 'remote-main',
                   'command': ['import', 'transfer-remote/bar/foo', '-x']},
                  {'source': 'fetch-main', 'remote_baseline': 'remote-main',
                   'command': ['fetch', '-c', 'transfer-remote/bar/foo']},
                  {'name': 'fetch-lane', 'source': 'fetch-main', 'remote_baseline': 'remote-lane',
                   'command': ['fetch', 'transfer-remote/dev', '--lanes']},
                  {'source': 'export-hub', 'remote_baseline': 'remote-empty',
                   'command': ['export']},
                  {'source': 'export-callback', 'remote_baseline': 'remote-empty',
                   'command': ['export', '--verbose']}]}
    (root / 'fixtures.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
