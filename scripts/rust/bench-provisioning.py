#!/usr/bin/env python3
"""Measure init/config/doctor on fresh fixtures and verify each complete command.

Requires pinned Node/Bit entry paths and a release Rust binary. The wrapper
argument is fingerprinted for provenance; the pinned Node/entry executes directly. Every pair uses the
same absolute workspace and global-config paths. Only native trace lines, fresh
scope random suffixes, and command-history timestamps/PIDs are normalized.
"""
import argparse
import datetime
import hashlib
import json
import os
import platform
from pathlib import Path
import re
import shlex
import shutil
import socketserver
import sys
import statistics
import subprocess
import tempfile
import threading
import time


class Catalog(socketserver.StreamRequestHandler):
    def handle(self):
        request = self.rfile.readline()
        assert request == b'CONNECT bvm.bit.dev:443 HTTP/1.1\r\n', request
        self.connection.settimeout(10)
        while True:
            line = self.rfile.readline()
            if line == b'\r\n':
                break
            if not line:
                raise ConnectionError('catalog proxy header ended prematurely')
        body = b'[{"version":"99.0.0","stable":true,"date":"2026-01-01"}]'
        self.server.request_count += 1
        self.wfile.write(b'HTTP/1.1 502 Fixture\r\nContent-Type: application/json\r\n'
                         + f'Content-Length: {len(body)}\r\nConnection: close\r\n\r\n'.encode()
                         + body)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def native_source(root):
    paths = subprocess.check_output(
        ['git', 'ls-files', '-co', '--exclude-standard', '-z', 'native'], cwd=root)
    digest = hashlib.sha256()
    for name in sorted(set(paths.split(b'\0')) - {b''}):
        path = root / os.fsdecode(name)
        if path.is_file():
            digest.update(name + b'\0' + path.read_bytes() + b'\0')
    return {'sha256': digest.hexdigest(), 'tracked_and_untracked_files': len([
        name for name in set(paths.split(b'\0')) - {b''} if (root / os.fsdecode(name)).is_file()])}


def normalize(data):
    return re.sub(rb'(?m)^bit-native:[^\n]*(?:\r?\n|$)', b'', data)


def state(root):
    result = {'.': [root.stat().st_mode & 0o7777, 'directory']}
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root).as_posix()
        mode = path.lstat().st_mode & 0o7777
        if path.is_symlink():
            value = ['link', os.readlink(path)]
        elif path.is_dir():
            value = ['directory']
        else:
            data = path.read_bytes()
            if path.name == 'scope.json':
                name = json.loads(data)['name']
                if re.fullmatch(r'workspace-local-[a-f0-9]{8}', name):
                    data, count = re.subn(rb'("name"\s*:\s*")' + name.encode() + rb'(")',
                                          rb'\1LOCAL_SCOPE\2', data)
                    assert count == 1, (path, count)
            elif path.name == 'command-history':
                lines = []
                for line in data.decode().splitlines(keepends=True):
                    timestamp, pid, command = line.split(' ', 2)
                    datetime.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                    assert pid.isdigit()
                    lines.append(command)
                data = ''.join(lines).encode()
            value = ['file', hashlib.sha256(data).hexdigest()]
        result[relative] = [mode, *value]
    return result


def execute(args, stage, baseline, command, mode, label, proxy):
    root = stage / 'workspace'
    globals_dir = stage / 'globals'
    home = stage / 'home'
    for path in [root, globals_dir, home]:
        if path.exists():
            shutil.rmtree(path)
    if baseline:
        shutil.copytree(baseline, root, symlinks=True)
    else:
        root.mkdir()
    home.mkdir()
    (globals_dir / 'config').mkdir(parents=True)
    (globals_dir / 'logs').mkdir()
    (globals_dir / 'logs/debug.log').touch()
    (globals_dir / 'config/config.json').write_text(json.dumps({'benchmark.value': 'configured',
        'analytics_reporting': 'false', 'error_reporting': 'false', 'log_level': 'fatal'}))
    (globals_dir / 'config/config.json').chmod(0o600)
    env = os.environ.copy()
    for key in ['CI', 'FORCE_COLOR', 'NO_COLOR', 'NODE_DISABLE_COLORS', 'BIT_NATIVE']:
        env.pop(key, None)
    env.update(BIT_GLOBALS_DIR=str(globals_dir), BIT_NATIVE_TRACE='1', NODE_NO_WARNINGS='1',
               HOME=str(home), USERPROFILE=str(home), BVM_https_proxy=proxy,
               BIT_NODE_BINARY=str(args.node_binary), BIT_NODE_CLI=str(args.node_cli),
               GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull)
    if mode == 'ci':
        env['CI'] = '1'
    argv = ([str(args.node_binary), str(args.node_cli)] if label == 'node'
            else [str(args.rust)]) + command
    if mode == 'tty':
        env.update(TERM='dumb', FORCE_COLOR='1')
        argv = ['script', '-q', '-e', '-c', shlex.join(argv), '/dev/null']
    binary = args.node_binary if label == 'node' else args.rust
    before_binary = sha(binary)
    start = time.perf_counter()
    output = subprocess.run(argv, cwd=root, env=env, capture_output=True, timeout=90)
    elapsed = round((time.perf_counter() - start) * 1000, 3)
    assert sha(binary) == before_binary, f'binary changed during command: {binary}'
    evidence = stage / 'evidence'
    evidence.mkdir(exist_ok=True)
    sequence = len(list(evidence.glob('*.stdout')))
    prefix = evidence / f'{sequence:04d}-{label}-{mode}-{command[0]}'
    prefix.with_suffix('.stdout').write_bytes(output.stdout)
    prefix.with_suffix('.stderr').write_bytes(output.stderr)
    trace = output.stdout + output.stderr
    assert output.returncode == 0, (argv, output.stdout, output.stderr)
    if label == 'rust':
        assert f'running `{command[0]}` natively'.encode() in trace, trace
        assert b'declined' not in trace and b'delegating:' not in trace, trace
    if command == ['doctor', '--json']:
        assert len(json.loads(normalize(output.stdout))['examineResults']) == 8
    result = {'exit_status': output.returncode, 'stdout': normalize(output.stdout).decode(),
              'stderr': normalize(output.stderr).decode(),
              'workspace': state(root), 'globals': state(globals_dir), 'home': state(home)}
    return elapsed, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['node', 'rust', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--node-binary', type=Path, default=os.environ.get('BIT_NODE_BINARY'))
    parser.add_argument('--node-cli', type=Path, default=os.environ.get('BIT_NODE_CLI'))
    parser.add_argument('--keep-going', action='store_true', help='Collect parity failures during debug smoke; exit nonzero afterward')
    parser.add_argument('--debug-smoke', action='store_true', help='Mark results as nonpublishable correctness smoke')
    args = parser.parse_args()
    if args.runs <= 0 or not args.node_binary or not args.node_cli:
        parser.error('positive --runs and pinned --node-binary/--node-cli are required')
    if args.keep_going and not args.debug_smoke:
        parser.error('--keep-going requires --debug-smoke')
    args.node_binary, args.node_cli = args.node_binary.resolve(), args.node_cli.resolve()
    args.output = args.output.resolve()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.node, args.rust = args.node.resolve(), args.rust.resolve()
    stage = Path(tempfile.mkdtemp(prefix='provisioning-bench-'))
    proxy = socketserver.TCPServer(('127.0.0.1', 0), Catalog)
    proxy.request_count = 0
    threading.Thread(target=proxy.serve_forever, daemon=True).start()
    proxy_url = f'http://127.0.0.1:{proxy.server_address[1]}'
    # Fixture generation is outside measured invocations and uses released Bit.
    execute(args, stage, None, ['init', '--standalone'], 'timed', 'node', proxy_url)
    baseline = stage / 'baseline'
    shutil.copytree(stage / 'workspace', baseline, symlinks=True)
    workloads = {
        'init': (None, ['init', '--standalone']),
        'init-bare': (None, ['init', '--bare', 'benchmark']),
        'config-get': (baseline, ['config', 'get', 'benchmark.value']),
        'config-set': (baseline, ['config', 'set', 'benchmark.value', 'updated']),
        'config-list': (baseline, ['config', 'list', '--json']),
        'doctor-list': (baseline, ['doctor', '--list']),
        'doctor-git': (baseline, ['doctor', 'validate git exec', '--json']),
        'doctor-default': (baseline, ['doctor', '--json']),
    }
    report = {'measured_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'platform': platform.platform(),
              'native_source': native_source(Path(__file__).resolve().parents[2]),
              'git_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=Path(__file__).resolve().parents[2], text=True).strip(),
              'publishable': not args.debug_smoke, 'complete': False,
              'verified_pairs': 0, 'failures': [], 'expected_pairs': len(workloads) * 3 * args.runs,
              'sha256': {'rust': sha(args.rust), 'node_wrapper': sha(args.node),
                         'benchmark_driver': sha(Path(__file__)),
                         'node_package': sha(args.node_cli.parent.parent / 'package.json') if (args.node_cli.parent.parent / 'package.json').is_file() else None,
                         'node_binary': sha(args.node_binary), 'node_cli': sha(args.node_cli)},
              'bit_version': json.loads((args.node_cli.parent.parent / 'package.json').read_text())['version'],
              'helper_sha256': {str(path.relative_to(Path(__file__).resolve().parents[2])): sha(path)
                  for path in sorted((Path(__file__).resolve().parents[2] / 'scripts/rust').glob('*.py'))},
              'oracle_execution': 'Pinned Node binary plus pinned JS entry; wrapper is provenance only',
              'node_version': subprocess.check_output([str(args.node_binary), '--version'], text=True).strip(),
              'pinned_paths': {'node_binary': str(args.node_binary), 'node_cli': str(args.node_cli)},
              'stage': str(stage), 'runs': args.runs,
              'fixture_state': state(baseline),
              'initial_settings': {'benchmark.value': 'configured', 'analytics_reporting': 'false',
                                   'error_reporting': 'false', 'log_level': 'fatal'},
              'fixture_sha256': hashlib.sha256(json.dumps(state(baseline), sort_keys=True).encode()).hexdigest(),
              'catalog': 'Local CONNECT proxy returns deterministic HTTP 502; no external BVM request succeeds',
              'environment': {key: os.environ.get(key) for key in
                              ['BIT_NODE_CLI', 'BIT_NODE_BINARY', 'PATH', 'TMPDIR']},
              'method': 'Alternating complete commands on fresh identical absolute paths; '
                        'strict stdout, stderr, exit, native ownership, every file, directory, '
                        'symlink and mode checked after every pair; serial execution.',
              'normalization': ['Native trace lines', 'Fresh workspace-local eight-hex scope suffix',
                                'Command-history timestamps and PIDs (commands retained)'],
              'workloads': {}}
    try:
        for name, (fixture, command) in workloads.items():
            measurements = {}
            for mode in ['timed', 'tty', 'ci']:
                samples = {'node': [], 'rust': []}
                for run in range(args.runs):
                    results = {}
                    for label in (['node', 'rust'] if run % 2 == 0 else ['rust', 'node']):
                        elapsed, result = execute(args, stage, fixture, command, mode, label, proxy_url)
                        samples[label].append(elapsed)
                        results[label] = result
                    if results['node'] != results['rust']:
                        mismatch = stage / f'mismatch-{name}-{mode}-{run}.json'
                        mismatch.write_text(json.dumps(results, indent=2))
                        report['failures'].append(str(mismatch))
                        if not args.keep_going:
                            raise RuntimeError(f'{name}/{mode}/{run}: mismatch; see {mismatch}')
                    else:
                        report['verified_pairs'] += 1
                    assert state(baseline) == report['fixture_state'], 'baseline mutated'
                medians = {label: statistics.median(values) for label, values in samples.items()}
                measurements[mode] = {'runs_ms': samples, 'median_ms': medians,
                                      'speedup': round(medians['node'] / medians['rust'], 3)}
            report['workloads'][name] = {'command': command, 'modes': measurements}
            report['catalog_requests'] = proxy.request_count
            if name == 'doctor-default':
                assert proxy.request_count == args.runs * 6
            report['complete'] = report['verified_pairs'] == report['expected_pairs']
            args.output.write_text(json.dumps(report, indent=2) + '\n')
            print(name, json.dumps({mode: value['speedup'] for mode, value in measurements.items()}),
                  flush=True, file=sys.stderr)
        if report['failures']:
            raise RuntimeError(f'{len(report["failures"])} strict parity failures; see {args.output}')
    finally:
        proxy.shutdown()
        proxy.server_close()


if __name__ == '__main__':
    main()
