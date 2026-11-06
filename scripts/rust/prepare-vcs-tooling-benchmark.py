#!/usr/bin/env python3
"""Seed valid VCS/tooling success workloads with the released Bit CLI outside timing."""
import grp
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

SCOPE = 'tooling-benchmark'
WORKLOADS = {
    'shared-group-export': ['export'],
    'subscriber-fork': ['fork', f'{SCOPE}/comp1', '--scope', 'tooling-local'],
    'subscriber-switch': ['switch', 'dev'],
    'active-lane-provider-import': ['lane', 'import', 'dev'],
    'lane-soft-tag': ['tag', '--soft', 'bar/foo', '--message', 'planned'],
}
REMAINING = {}


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
        'teambit.preview/preview': {'disabled': True},
        'teambit.component/issues': {'ignoreIssues': ['MissingManuallyConfiguredPackages']}}))
    clean, empty_remote = stage / 'clean', stage / 'remote-empty'
    shutil.copytree(workspace, clean, symlinks=True)
    shutil.copytree(remote, empty_remote, symlinks=True)

    def reset():
        shutil.rmtree(workspace)
        shutil.copytree(clean, workspace, symlinks=True)
        shutil.rmtree(remote)
        shutil.copytree(empty_remote, remote, symlinks=True)

    def add(directory, identity, source, filename='index.js'):
        path = workspace / directory
        path.mkdir(parents=True)
        (path / filename).write_text(source)
        run('add', directory, '-i', identity)

    def bitmap_env(key, environment_id):
        path = workspace / '.bitmap'
        value = json.loads(re.sub(r'/\*.*?\*/', '', path.read_text(), flags=re.S))
        value[key]['config'] = {
            environment_id: {}, 'teambit.envs/envs': {'env': environment_id}}
        path.write_text(json.dumps(value, indent=4))

    def bitmap_aspect(key, aspect):
        path = workspace / '.bitmap'
        value = json.loads(re.sub(r'/\*.*?\*/', '', path.read_text(), flags=re.S))
        value[key].setdefault('config', {})[aspect] = {}
        path.write_text(json.dumps(value, indent=4))

    def provider(source_name, source, identity, environment_id):
        add(source_name, identity, source)
        bitmap_env(identity, environment_id)
        run('link')
        (workspace / source_name / 'dist').mkdir(exist_ok=True)
        (workspace / source_name / 'dist/index.js').write_text(source)
        run('tag', identity, '--ignore-issues', '*', '--message', 'provider')
        config_file = workspace / 'workspace.jsonc'
        config = json.loads(config_file.read_text())
        config[f'{SCOPE}/{identity}'] = {}
        config_file.write_text(json.dumps(config))

    def subscriber_provider():
        source = (Path(__file__).resolve().parents[2] /
                  'native/cli/tests/e2e/harmony/install_compat.cjs').read_text()
        add('install-compat', 'env/install-compat', source)
        bitmap_env('env/install-compat', 'teambit.harmony/empty-env')
        path = workspace / '.bitmap'
        bitmap = json.loads(re.sub(r'/\*.*?\*/', '', path.read_text(), flags=re.S))
        bitmap['env/install-compat']['config']['teambit.pkg/pkg'] = {
            'packageJson': {'main': 'dist/index.js'}}
        path.write_text(json.dumps(bitmap, indent=4))
        run('link')
        (workspace / 'install-compat/dist').mkdir(exist_ok=True)
        (workspace / 'install-compat/dist/index.js').write_text(source)
        run('tag', 'env/install-compat', '--ignore-issues', '*', '--message', 'provider')
        config_file = workspace / 'workspace.jsonc'
        config = json.loads(config_file.read_text())
        config[f'{SCOPE}/env/install-compat'] = {}
        config_file.write_text(json.dumps(config))

    def callback_provider():
        fixture = (Path(__file__).resolve().parents[2] /
                   'native/cli/tests/e2e/harmony/snapshot_environments.rs').read_text()
        source = re.search(r'const HOOK: &str = r"(.*?)";\n', fixture, re.S).group(1)
        source = source.replace('__ASPECT__', f'{SCOPE}/callbacks/hook').replace('__FAIL__', 'false')
        provider('snapshot-hook', source, 'callbacks/hook', 'teambit.harmony/aspect')
        aspect = (workspace / 'node_modules/.bit_roots/teambit.harmony_aspect/node_modules' /
                  f'@{SCOPE}/callbacks.hook/dist/index.js')
        aspect.parent.mkdir(parents=True, exist_ok=True)
        aspect.write_text(source)
        (workspace / 'bar/component.json').write_text(json.dumps({
            'componentId': {'scope': SCOPE, 'name': 'bar/foo'},
            'extensions': {f'{SCOPE}/callbacks/hook': {}}}))
        return source, aspect

    baselines, remotes = {}, {}
    for name in WORKLOADS:
        reset()
        if name == 'shared-group-export':
            group = grp.getgrgid(os.getgid()).gr_name
            remote_scope = remote / 'scope.json'
            value = json.loads(remote_scope.read_text())
            value['groupName'] = group
            remote_scope.write_text(json.dumps(value, indent=4))
            for index in range(12):
                add(f'comp{index:02}', f'comp{index:02}', f"module.exports = '{index}';\n")
            run('tag', '--ignore-issues', '*', '--message', 'shared export')
        elif name in {'subscriber-fork', 'subscriber-switch'}:
            for index in range(1, 13):
                add(f'comp{index}', f'comp{index}', f"module.exports = '{index}';\n")
            bitmap_env('comp1', 'teambit.harmony/empty-env')
            run('tag', '--ignore-issues', '*', '--message', 'baseline')
            run('export')
            if name == 'subscriber-fork':
                shutil.rmtree(workspace)
                shutil.copytree(clean, workspace, symlinks=True)
            subscriber_provider()
            if name == 'subscriber-fork':
                run('export')
            else:
                bitmap_aspect('comp1', f'{SCOPE}/env/install-compat')
                run('export')
                run('lane', 'create', 'dev')
                (workspace / 'comp1/index.js').write_text("module.exports = 'on lane';\n")
                run('snap', 'comp1', '--message', 'lane')
                run('switch', 'main', '-x')
            (workspace / 'install-compat-active').write_text('active')
        elif name == 'active-lane-provider-import':
            add('bar', 'bar/foo', "module.exports = 'provider import';\n", 'foo.js')
            source, aspect = callback_provider()
            run('tag', 'bar/foo', '--ignore-issues', '*', '--message', 'main')
            run('export')
            run('lane', 'create', 'dev')
            run('snap', 'bar/foo', '--unmodified', '--message', 'dev')
            run('export')
            run('switch', 'main', '--skip-fetch', '-x', '--auto-merge-resolve', 'theirs')
            run('lane', 'create', 'other')
            edited = source.replace('console.log(\'fixture provider startup\');',
                "fs.appendFileSync(workspace.path+'/lane-import-provider-startups','x');console.log('fixture provider startup');")
            (workspace / 'snapshot-hook/dist/index.js').write_text(edited)
            aspect.write_text(edited)
        elif name == 'lane-soft-tag':
            add('bar', 'bar/foo', "module.exports = 'lane soft';\n", 'foo.js')
            run('link')
            run('lane', 'create', 'dev')
            run('snap', 'bar/foo', '--message', 'seed')
            (workspace / 'bar/foo.js').write_text("module.exports = 'lane soft changed';\n")
        baseline, remote_baseline = stage / f'baseline-{name}', stage / f'baseline-remote-{name}'
        shutil.copytree(workspace, baseline, symlinks=True)
        shutil.copytree(remote, remote_baseline, symlinks=True)
        baselines[name], remotes[name] = baseline, remote_baseline
    home, globals_dir = stage / 'baseline-home', stage / 'baseline-globals'
    shutil.copytree(stage / 'home', home, symlinks=True)
    shutil.copytree(stage / 'globals', globals_dir, symlinks=True)
    original = stage / 'remote-original'
    original.mkdir()
    original_baseline = stage / 'baseline-original'
    shutil.copytree(original, original_baseline)
    originals = {name: original_baseline for name in WORKLOADS}
    return baselines, remotes, originals, home, globals_dir
