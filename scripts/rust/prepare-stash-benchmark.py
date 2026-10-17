#!/usr/bin/env python3
"""Seed stash workloads with the pinned published CLI, outside measured commands."""
import json
from pathlib import Path
import shutil
import subprocess

WORKLOADS = {
    'save': ['stash', 'save', '--message', 'benchmark'],
    'save-new': ['stash', 'save', '--include-new', '--message', 'benchmark'],
    'list': ['stash', 'list'],
    'load': ['stash', 'load'],
    'load-conflict': ['stash', 'load', '--manual'],
    'restore-new': ['stash', 'load'],
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
    def run(*command):
        result = subprocess.run([str(args.node_binary), str(args.node_cli), *command],
                                cwd=workspace, env=environment, capture_output=True, timeout=120)
        if result.returncode:
            raise RuntimeError(f'seed {command}: {result.stdout!r} {result.stderr!r}')
    run('init', '--standalone', '--no-package-json')
    (workspace / 'workspace.jsonc').write_text(json.dumps({
        'teambit.workspace/workspace': {'name': 'stash-benchmark', 'defaultScope': 'stash-benchmark'},
        'teambit.preview/preview': {'disabled': True}}))
    component = workspace / 'comp1'
    component.mkdir()
    source = component / 'index.js'
    source.write_text("module.exports = 'base';\n\n")
    run('add', 'comp1')
    # Installed metadata/type fixtures match the pinned default Node environment's
    # manually configured dev dependencies; measured commands do not ignore issues.
    for name, version in [('@types/jest', '26.0.20'), ('@types/node', '22.10.5')]:
        package = workspace / 'node_modules' / name
        package.mkdir(parents=True, exist_ok=True)
        (package / 'package.json').write_text(json.dumps({
            'name': name, 'version': version, 'types': 'index.d.ts'}))
        (package / 'index.d.ts').write_text('export {};\n')
    run('tag', 'comp1', '--message', 'initial')
    clean = stage / 'clean'
    shutil.copytree(workspace, clean, symlinks=True)
    baseline_home, baseline_globals = stage / 'baseline-home', stage / 'baseline-globals'
    shutil.copytree(stage / 'home', baseline_home, symlinks=True)
    shutil.copytree(stage / 'globals', baseline_globals, symlinks=True)
    baselines = {}
    for name in WORKLOADS:
        shutil.rmtree(workspace)
        shutil.copytree(clean, workspace, symlinks=True)
        source.write_text("module.exports = 'stashed';\n\n")
        if name in {'save-new', 'restore-new'}:
            new = workspace / 'nested/new'
            new.mkdir(parents=True)
            (new / 'index.js').write_text("module.exports = 'new component';\n")
            run('add', 'nested/new', '--id', 'fresh/component')
        if name in {'list', 'load', 'load-conflict', 'restore-new'}:
            flags = ['--include-new'] if name == 'restore-new' else []
            run('stash', 'save', *flags, '--message', 'benchmark')
        if name == 'load-conflict':
            source.write_text("module.exports = 'local conflict';\n\n")
        target = stage / f'baseline-{name}'
        shutil.copytree(workspace, target, symlinks=True)
        baselines[name] = target
    return baselines, baseline_home, baseline_globals


def prewarm_builtin_facts(args, stage, fixtures, environment):
    """Seed only validated Node builtin names into the shared globals fixture.

    Warmup runs the actual native CLI on an isolated disposable workspace, home
    and globals. Its filesystem changes are discarded except for the exact
    builtin-fact cache validated against the pinned Node binary below.
    """
    import hashlib
    import tempfile
    binary = args.node_binary.stat()
    key = f'{args.node_binary}\n{binary.st_size}\n{binary.st_mtime_ns}'.encode()
    filename = f'node-builtins-{hashlib.sha1(key).hexdigest()}.json'
    modules = json.loads(subprocess.check_output(
        [str(args.node_binary), '-e', "process.stdout.write(JSON.stringify(require('module').builtinModules))"],
        env=environment, timeout=30))
    if not isinstance(modules, list) or not all(isinstance(name, str) for name in modules):
        raise RuntimeError('pinned Node builtinModules schema changed')
    names = []
    for module in modules:
        for name in ([module] if module.startswith('node:') else [module, 'node:' + module]):
            if name not in names:
                names.append(name)
    expected = json.dumps(names, separators=(',', ':'), ensure_ascii=False).encode()
    destination = Path(fixtures['globals']) / 'native-cli' / filename
    previous = fixtures.get('builtin_facts_prewarming')
    if previous:
        if destination.is_symlink() or destination.read_bytes() != expected or previous['node_binary_sha256'] != hashlib.sha256(args.node_binary.read_bytes()).hexdigest():
            raise RuntimeError('validated warm builtin metadata fixture no longer matches pinned Node')
        return previous
    with tempfile.TemporaryDirectory(prefix='builtin-facts-warm-', dir=stage) as temporary:
        root = Path(temporary)
        shutil.copytree(stage / 'clean', root / 'workspace', symlinks=True)
        shutil.copytree(fixtures['home'], root / 'home', symlinks=True)
        shutil.copytree(fixtures['globals'], root / 'globals', symlinks=True)
        warm_env = environment.copy()
        warm_env.update(HOME=str(root / 'home'), USERPROFILE=str(root / 'home'),
                        BIT_GLOBALS_DIR=str(root / 'globals'))
        command = [str(args.rust), 'status', '--json']
        output = subprocess.run(command, cwd=root / 'workspace', env=warm_env,
                                capture_output=True, timeout=120)
        (stage / 'builtin-facts-prewarm.stdout').write_bytes(output.stdout)
        (stage / 'builtin-facts-prewarm.stderr').write_bytes(output.stderr)
        trace = output.stdout + output.stderr
        if output.returncode or b'running `status` natively' not in trace or b'declined' in trace:
            raise RuntimeError('isolated native builtin metadata warmup failed')
        cache = root / 'globals/native-cli' / filename
        if not cache.is_file() or cache.is_symlink() or cache.read_bytes() != expected:
            raise RuntimeError('native builtin cache differs from pinned Node facts/schema/serialization')
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copystat(cache.parent, destination.parent)
        shutil.copy2(cache, destination)
    return {'method': 'actual native status --json in isolated disposable workspace/home/globals',
            'command': command, 'exit_status': output.returncode,
            'copied_only': f'native-cli/{filename}',
            'schema': 'deduplicated ordered string array; builtinModules plus node: forms',
            'source': "pinned Node require('module').builtinModules",
            'fact_count': len(names), 'cache_sha256': hashlib.sha256(expected).hexdigest(),
            'cache_mode': destination.stat().st_mode & 0o7777,
            'node_binary_sha256': hashlib.sha256(args.node_binary.read_bytes()).hexdigest(),
            'prewarming_rust_sha256': hashlib.sha256(args.rust.read_bytes()).hexdigest(),
            'timing_model': 'warm metadata fixture for both implementations; no first-use performance claim'}
