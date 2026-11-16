#!/usr/bin/env python3
"""Build released-CLI lane adoption inputs outside all measurements.

Each command gets its own immutable workspace and file remote. Conflicts are real
source edits; provider/installer cases use the same physically compiled public
subscriber/compiler fixture as the strict Rust suite. No callback delays or fake
clocks are introduced into benchmark commands.
"""
import json
from pathlib import Path
import shutil
import subprocess
import sys
sys.dont_write_bytecode = True

SCOPE = 'lane-adoption-benchmark'
WORKLOADS = {
    'remote-alias': ['switch', f'{SCOPE}/dev', '--alias', 'adopted', '-x'],
    'local-alias': ['switch', 'adopted', '--skip-fetch', '-x'],
    'scoped-lookup': ['switch', f'{SCOPE}/dev', '--skip-fetch', '-x'],
    'empty-pattern': ['switch', f'{SCOPE}/dev', '--pattern', f'{SCOPE}/comp0[024]', '-x'],
    'workspace-only': ['switch', f'{SCOPE}/dev', '--workspace-only', '-x'],
    'merge-ours': ['switch', 'lane-b', '--auto-merge-resolve', 'ours', '-x'],
    'merge-theirs': ['switch', 'lane-b', '--auto-merge-resolve', 'theirs', '-x'],
    'merge-manual': ['switch', 'lane-b', '--auto-merge-resolve', 'manual', '-x'],
    'default-install': ['switch', f'{SCOPE}/dev', '--pattern', f'{SCOPE}/comp00'],
    'provider-install': ['switch', 'dev'],
    'mutable-install': ['switch', 'dev'],
}
INSTALLATIONS = {'default-install', 'provider-install', 'mutable-install'}
PROVIDERS = {'provider-install', 'mutable-install'}
HISTORY_REASONS = {name: (['lane-switch'] if name == 'merge-ours' else ['checkout', 'lane-switch'])
                   for name in WORKLOADS}


def seed(args, stage, environment):
    workspace, remote = stage / 'workspace', stage / 'remote'
    for path in [workspace, remote, stage / 'home', stage / 'globals/config']:
        path.mkdir(parents=True)
    (stage / 'globals/config/config.json').write_text(json.dumps({
        'analytics_reporting': 'false', 'error_reporting': 'false',
        'user.name': 'CI', 'user.email': 'ci@bit.dev', 'log_level': 'fatal'}))

    def run(*command, cwd=workspace):
        result = subprocess.run([str(args.node_binary), str(args.node_cli), *command],
                                cwd=cwd, env=environment, capture_output=True, timeout=300)
        if result.returncode:
            raise RuntimeError(f'lane preparation {command}: {result.stdout!r} {result.stderr!r}')
        return result.stdout

    run('init', '--bare', SCOPE, cwd=remote)
    run('init', '--standalone', '--no-package-json')
    scope_path = workspace / '.bit/scope.json'
    scope = json.loads(scope_path.read_text())
    scope['remotes'] = {SCOPE: remote.as_uri()}
    scope_path.write_text(json.dumps(scope, indent=4))
    (workspace / 'workspace.jsonc').write_text(json.dumps({
        'teambit.workspace/workspace': {'name': SCOPE, 'defaultScope': SCOPE},
        'teambit.preview/preview': {'disabled': True}}))
    clean, empty_remote = stage / 'clean', stage / 'empty-remote'
    copy(workspace, clean)
    copy(remote, empty_remote)
    baselines, remotes = {}, {}
    for workload in WORKLOADS:
        reset(clean, workspace)
        reset(empty_remote, remote)
        if workload in PROVIDERS:
            provider_fixture(workspace, run, workload)
        elif workload.startswith('merge-'):
            conflict_fixture(workspace, run)
        else:
            ordinary_fixture(workspace, clean, run, workload)
        baseline = stage / f'baseline-{workload}'
        remote_baseline = stage / f'baseline-remote-{workload}'
        copy(workspace, baseline)
        copy(remote, remote_baseline)
        baselines[workload], remotes[workload] = baseline, remote_baseline
    home, globals_directory = stage / 'baseline-home', stage / 'baseline-globals'
    copy(stage / 'home', home)
    copy(stage / 'globals', globals_directory)
    return baselines, remotes, home, globals_directory


def copy(source, destination):
    shutil.copytree(source, destination, symlinks=True)


def reset(source, destination):
    shutil.rmtree(destination)
    copy(source, destination)


def component(workspace, run, name):
    directory = workspace / name
    directory.mkdir()
    (directory / 'index.js').write_text(f"module.exports='{name} main';\n")
    for index in range(10):
        (directory / f'file-{index:02}.js').write_text(f'module.exports={index};\n')
    run('add', name, '--id', name)
    run('env', 'set', name, 'teambit.harmony/empty-env')


def ordinary_fixture(workspace, clean, run, workload):
    count = 6 if workload in {'empty-pattern', 'workspace-only'} else 2
    for index in range(count):
        component(workspace, run, f'comp{index:02}')
    run('tag', '--ignore-issues', '*', '--message', 'lane benchmark main')
    run('export')
    run('lane', 'create', 'dev')
    for index in range(count):
        (workspace / f'comp{index:02}/index.js').write_text(f"module.exports='comp{index:02} lane';\n")
    run('snap', '--unmodified', '--ignore-issues', '*', '--message', 'lane benchmark head')
    run('export')
    reset(clean, workspace)
    if workload in {'local-alias', 'scoped-lookup'}:
        run('switch', f'{SCOPE}/dev', '--alias', 'adopted', '-x')
        run('switch', 'main', '-x')
    elif workload == 'workspace-only':
        run('import', f'{SCOPE}/comp00', f'{SCOPE}/comp01', '-x')


def conflict_fixture(workspace, run):
    component(workspace, run, 'comp1')
    run('lane', 'create', 'lane-a')
    (workspace / 'comp1/index.js').write_text("module.exports='lane-a';\n")
    run('snap', '--ignore-issues', '*', '--message', 'a')
    run('export')
    run('lane', 'create', 'lane-b')
    (workspace / 'comp1/index.js').write_text("module.exports='lane-b';\n")
    run('snap', '--ignore-issues', '*', '--message', 'b')
    run('export')
    run('switch', 'lane-a', '-x')
    (workspace / 'comp1/index.js').write_text('// uncommitted local edit on lane-a\n')


def provider_fixture(workspace, run, workload):
    component(workspace, run, 'comp1')
    fixture = Path(__file__).resolve().parents[2] / 'native/cli/tests/e2e/harmony/lane_adoption/callbacks.cjs'
    source = fixture.read_bytes()
    directory = workspace / 'lane-provider'
    directory.mkdir()
    (directory / 'index.js').write_bytes(source)
    run('add', 'lane-provider', '--id', 'env/lane-adoption')
    run('env', 'set', 'env/lane-adoption', 'teambit.harmony/empty-env')
    path = workspace / '.bitmap'
    bitmap = json.loads(path.read_text()[path.read_text().index('{'):])
    bitmap['env/lane-adoption'].setdefault('config', {})['teambit.pkg/pkg'] = {'packageJson': {'main': 'dist/index.js'}}
    path.write_text(json.dumps(bitmap, indent=4))
    run('link')
    (directory / 'dist').mkdir(exist_ok=True)
    (directory / 'dist/index.js').write_bytes(source)
    run('tag', 'env/lane-adoption', '--ignore-issues', '*', '--message', 'provider')
    run('export')
    config_path = workspace / 'workspace.jsonc'
    config = json.loads(config_path.read_text())
    config[f'{SCOPE}/env/lane-adoption'] = {}
    config_path.write_text(json.dumps(config))
    # Match the qualified Rust fixture's explicit configuration. The provider is
    # physically compiled and registers its actual Node environment when loaded;
    # `env set` additionally validates the pre-registration component descriptor.
    raw = path.read_text()
    bitmap = json.loads(raw[raw.index('{'):])
    specific = bitmap['comp1'].setdefault('config', {})
    old_env = specific.get('teambit.envs/envs', {}).get('env')
    env = f'{SCOPE}/env/lane-adoption'
    if old_env and old_env != env:
        specific.pop(old_env, None)
    specific[env] = {}
    specific['teambit.envs/envs'] = {'env': env}
    path.write_text(json.dumps(bitmap, indent=4))
    run('tag', '--ignore-issues', '*', '--message', 'main')
    run('export')
    run('lane', 'create', 'dev')
    (workspace / 'comp1/index.js').write_text("module.exports='switched lane body';\n")
    run('snap', '--ignore-issues', '*', '--message', 'lane')
    run('export')
    run('switch', 'main', '-x')
    (workspace / 'lane-adoption-provider-active').write_text('active')
    (workspace / 'lane-adoption-record-phases').write_text('active')
    if workload == 'mutable-install':
        (workspace / 'lane-adoption-mutate-install').write_text('active')
        local = workspace / 'subscriber-linked'
        local.mkdir()
        (local / 'package.json').write_text(json.dumps({'name': '@fixture/subscriber-linked', 'version': '1.0.0', 'main': 'index.js'}))
        (local / 'index.js').write_text("module.exports='subscriber local package';\n")
