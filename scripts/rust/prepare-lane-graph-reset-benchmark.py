#!/usr/bin/env python3
"""Prepare real released-CLI graph reset inputs, strictly outside measurement.

Each baseline replays at stage/workspace with its corresponding immutable bare
remote, HOME and globals. No Version bodies or graph objects are fabricated.
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
sys.dont_write_bytecode = True


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ADOPTION = load('graph_reset_adoption', 'prepare-lane-adoption-benchmark.py')
SCOPE = 'lane-graph-reset-benchmark'
WORKLOADS = {name: ['reset', '--silent'] for name in [
    'merged-all', 'head-only-merge', 'fast-forward', 'diverged-all',
    'selected-introduced', 'snapped-deletion', 'unknown-inherited', 'sparse-ancestry']}
WORKLOADS['head-only-merge'] = ['reset', '--head', '--silent']
WORKLOADS['selected-introduced'] = ['reset', 'comp1', '--silent']
ERRORS = {'head-only-merge', 'unknown-inherited'}
EXPECTED_CODES = {name: int(name in ERRORS) for name in WORKLOADS}
HISTORY_REASONS = {name: ([] if name in ERRORS else ['reset']) for name in WORKLOADS}
CI_NATIVE = {name: name not in ERRORS for name in WORKLOADS}
INSTALLATIONS = set()
PROVIDERS = set()


def seed(args, stage, environment):
    root, remote = stage / 'workspace', stage / 'remote'
    for path in [root, remote, stage / 'home', stage / 'globals/config']:
        path.mkdir(parents=True)
    (stage / 'globals/config/config.json').write_text(json.dumps({
        'analytics_reporting': 'false', 'error_reporting': 'false',
        'user.name': 'CI', 'user.email': 'ci@bit.dev', 'log_level': 'fatal'}))
    commands = []

    def run(*command, cwd=root):
        output = subprocess.run([str(args.node_binary), str(args.node_cli), *command],
                                cwd=cwd, env=environment, capture_output=True, timeout=300)
        commands.append({'cwd': str(cwd), 'args': list(command), 'code': output.returncode})
        if output.returncode:
            raise RuntimeError(f'graph reset preparation {command}: {output.stdout!r} {output.stderr!r}')
        return output.stdout

    run('init', '--bare', SCOPE, cwd=remote)
    run('init', '--standalone', '--no-package-json')
    scope_path = root / '.bit/scope.json'
    scope = json.loads(scope_path.read_text())
    scope['remotes'] = {SCOPE: remote.as_uri()}
    scope_path.write_text(json.dumps(scope, indent=4))
    (root / 'workspace.jsonc').write_text(json.dumps({
        'teambit.workspace/workspace': {'name': SCOPE, 'defaultScope': SCOPE},
        'teambit.preview/preview': {'disabled': True}}))
    clean, empty_remote = stage / 'clean', stage / 'empty-remote'
    ADOPTION.copy(root, clean)
    ADOPTION.copy(remote, empty_remote)
    baselines, remotes, contracts, environments = {}, {}, {}, {}
    for name in WORKLOADS:
        ADOPTION.reset(clean, root)
        ADOPTION.reset(empty_remote, remote)
        start = len(commands)
        contract = prepare_case(name, root, stage, clean, run)
        # Real metadata/cache warming; no command under comparison is executed here.
        run('status', '--json')
        lane = bitmap(root)['_bit_lane']['id']
        contract.update({
            'command': WORKLOADS[name], 'expected_code': EXPECTED_CODES[name],
            'history_reasons': HISTORY_REASONS[name],
            'native_by_mode': {'timed': True, 'tty': True, 'ci': CI_NATIVE[name]},
            'ci_decline_reason': ('CI lane reset diagnostics require the published stack'
                                  if name in ERRORS else None),
            'baseline_versions': versions(root),
            'expected_lane': f"{lane['scope']}/{lane['name']}",
            'unchanged_source_paths': sorted(str(path.relative_to(root))
                                           for path in root.glob('comp*/*.js')),
            'preparation_commands': commands[start:]})
        baseline, bare = stage / f'baseline-{name}', stage / f'baseline-remote-{name}'
        home, globals_directory = stage / f'baseline-home-{name}', stage / f'baseline-globals-{name}'
        for source, destination in [(root, baseline), (remote, bare),
                                    (stage / 'home', home), (stage / 'globals', globals_directory)]:
            ADOPTION.copy(source, destination)
        baselines[name], remotes[name], contracts[name] = baseline, bare, contract
        environments[name] = {'home': str(home), 'globals': str(globals_directory)}
    home, globals_directory = stage / 'baseline-home', stage / 'baseline-globals'
    ADOPTION.copy(stage / 'home', home)
    ADOPTION.copy(stage / 'globals', globals_directory)
    (stage / 'graph-reset-contracts.json').write_text(json.dumps({
        'commands': WORKLOADS, 'contracts': contracts, 'workload_environment': environments,
        'preparation_commands': commands}, indent=2) + '\n')
    return baselines, remotes, home, globals_directory


def component(root, run, name):
    ADOPTION.component(root, run, name)


def snap(run, *options):
    run('snap', '--ignore-issues', '*', '--message', 'graph reset benchmark', *options)


def tag(run):
    run('tag', '--ignore-issues', '*', '--message', 'graph reset benchmark')


def head(run, lane='dev', name='comp1'):
    value = json.loads(run('cat-lane', lane))
    return next(row['head'] for row in value['components'] if row['id']['name'] == name)


def version(run, reference):
    return json.loads(run('cat-component', f'comp1@{reference}', '--json'))


def versions(root):
    return {key: row['version'] for key, row in bitmap(root).items()
            if isinstance(row, dict) and 'rootDir' in row}


def bitmap(root):
    raw = (root / '.bitmap').read_text()
    return json.loads(raw[raw.index('{'):])


def edit(root, text):
    (root / 'comp1/index.js').write_text(f"module.exports='{text}';\n")


def prepare_case(name, root, stage, clean, run):
    if name in {'merged-all', 'head-only-merge'}:
        return merged(root, run)
    if name == 'fast-forward':
        return fast_forward(root, run)
    if name == 'diverged-all':
        return diverged(root, stage, run)
    if name == 'selected-introduced':
        return introduced(root, run)
    if name == 'snapped-deletion':
        return deletion(root, run)
    if name == 'unknown-inherited':
        return unknown(root, clean, run)
    if name == 'sparse-ancestry':
        return sparse(root, clean, run)
    raise ValueError(f'unknown graph reset workload {name}')


def merged(root, run):
    component(root, run, 'comp1')
    tag(run)
    run('export')
    run('lane', 'create', 'dev')
    edit(root, 'exported lane')
    snap(run)
    run('export')
    exported = head(run)
    run('switch', 'main', '-x')
    edit(root, 'advanced main')
    tag(run)
    run('export')
    run('switch', 'dev', '-x')
    run('lane', 'merge', 'main', '--auto-merge-resolve', 'theirs', '-x')
    merged_head = head(run)
    parents = version(run, merged_head)['parents']
    if len(parents) != 2 or exported not in parents:
        raise RuntimeError('released fixture did not create the intended two-parent merge')
    return {'expected_head': exported, 'merged_head': merged_head, 'parents': parents,
            'preserve_working_tree': True, 'preserve_immutable_objects': True,
            'error_contains': f'multiple parents for a local (un-exported) version {merged_head}'}


def fast_forward(root, run):
    component(root, run, 'comp1')
    run('lane', 'create', 'dev')
    snap(run)
    run('export')
    exported = head(run)
    run('switch', 'main', '-x')
    run('lane', 'merge', f'{SCOPE}/dev', '-x')
    tag(run)
    run('export')
    edit(root, 'advanced main')
    tag(run)
    run('export')
    run('switch', 'dev', '-x')
    run('lane', 'merge', 'main', '-x')
    merged_head = head(run)
    if len(version(run, merged_head)['parents']) != 1 or merged_head == exported:
        raise RuntimeError('released fixture did not fast-forward to a distinct one-parent head')
    return {'expected_head': exported, 'merged_head': merged_head,
            'preserve_working_tree': True, 'preserve_immutable_objects': True}


def diverged(root, stage, run):
    component(root, run, 'comp1')
    run('lane', 'create', 'dev')
    snap(run)
    run('export')
    exported = head(run)
    reader = stage / 'diverged-reader'
    ADOPTION.copy(root, reader)
    snap(run, '--unmodified')
    run('export')
    remote_head = head(run)
    ADOPTION.reset(reader, root)
    edit(root, 'unexported local divergence')
    snap(run)
    local = head(run)
    run('import', '-x')
    status = json.loads(run('status', '--json'))
    if len(status['mergePendingComponents']) != 1:
        raise RuntimeError('released fixture did not create a merge-pending divergence')
    return {'expected_head': exported, 'local_head': local, 'remote_head': remote_head,
            'preserve_working_tree': True, 'preserve_immutable_objects': True}


def introduced(root, run):
    for name in ['comp1', 'comp2']:
        component(root, run, name)
    tag(run)
    run('export')
    run('lane', 'create', 'dev')
    snap(run, '--unmodified')
    return {'selected': [f'{SCOPE}/comp1'], 'remaining_lane_heads': {'comp2': head(run, name='comp2')},
            'expected_versions': {'comp1': '0.0.1'}, 'preserve_working_tree': True}


def deletion(root, run):
    for name in ['comp1', 'comp2']:
        component(root, run, name)
    tag(run)
    run('export')
    run('lane', 'create', 'dev')
    snap(run, '--unmodified')
    run('export')
    exported = {name: head(run, name=name) for name in ['comp1', 'comp2']}
    run('delete', 'comp1', '--silent', '--lane')
    snap(run, '--unmodified')
    return {'expected_lane_heads': exported, 'expected_reset_components': 2,
            'preserve_working_tree': True}


def unknown(root, clean, run):
    component(root, run, 'comp1')
    run('lane', 'create', 'dev')
    snap(run)
    run('export')
    ADOPTION.reset(clean, root)
    run('lane', 'create', 'unrelated')
    run('lane', 'merge', f'{SCOPE}/dev', '-x')
    snap(run, '--unmodified')
    return {'unchanged_head': head(run, lane='unrelated'),
            'error_contains': 'fatal: unable to find a new head', 'preserve_working_tree': True}


def sparse(root, clean, run):
    component(root, run, 'comp1')
    run('lane', 'create', 'dev')
    snap(run)
    run('export')
    run('lane', 'create', 'forked')
    snap(run, '--unmodified')
    run('export')
    exported = head(run, lane='forked')
    run('switch', 'dev', '-x')
    references = []
    for _ in range(3):
        snap(run, '--unmodified')
        references.append(head(run))
    run('export')
    ADOPTION.reset(clean, root)
    run('lane', 'import', f'{SCOPE}/forked', '-x')
    run('lane', 'merge', f'{SCOPE}/dev', '-x')
    absent = references[:-1]
    for reference in absent:
        if (root / '.bit/objects' / reference[:2] / reference[2:]).exists():
            raise RuntimeError('real sparse fixture unexpectedly retained an intermediate Version body')
    return {'expected_head': exported, 'absent_version_bodies': absent,
            'imported_remote_head': references[-1], 'preserve_working_tree': True,
            'preserve_immutable_objects': True}
