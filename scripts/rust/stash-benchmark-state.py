#!/usr/bin/env python3
"""Strict stash state comparison; only fresh detached log dates/hashes and history ISO/PIDs vary."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import zlib


def sha(data):
    return hashlib.sha256(data).hexdigest()


def scope(root):
    return root / '.bit' if (root / '.bit').is_dir() else root / '.git/bit'


def objects(root):
    result = {}
    for path in sorted((scope(root) / 'objects').glob('*/*')):
        if not path.is_file() or path.is_symlink():
            raise RuntimeError(f'nonregular scope object: {path}')
        raw = zlib.decompress(path.read_bytes())
        header, separator, body = raw.partition(b'\0')
        if not separator:
            raise RuntimeError(f'invalid object header: {path}')
        reference = path.parent.name + path.name
        kind = header.split(b' ', 1)[0].decode()
        length = len(body.decode('utf-8', errors='replace').encode('utf-16-le')) // 2
        if header != f'{kind} {reference} {length}'.encode():
            raise RuntimeError(f'invalid object identity/length header: {path}')
        result[reference] = (kind, body, path.lstat().st_mode & 0o7777,
                             path.parent.stat().st_mode & 0o7777)
    return result


def manifests(root):
    directory = scope(root) / 'stash'
    result = {}
    if not directory.exists():
        return result
    for path in sorted(directory.glob('stash-*')):
        if not path.is_file() or path.is_symlink():
            raise RuntimeError(f'nonregular stash metadata: {path}')
        raw = path.read_bytes()
        value = json.loads(raw)
        expected = json.dumps(value, indent=4, ensure_ascii=False).encode()
        if raw != expected:
            raise RuntimeError(f'stash serialization changed: {path}')
        result[path.name] = value
    return result


def detached_mapping(root, baseline_objects):
    mapping = {}
    for filename, data in manifests(root).items():
        for row in data['stashCompsData']:
            reference = row['hash']
            if reference in baseline_objects:
                continue
            identity = json.dumps(row['id'], separators=(',', ':'), ensure_ascii=False)
            marker = f'DETACHED:{filename}:{identity}'
            allocation = {'marker': marker, 'is_new': row['isNew']}
            if reference in mapping and mapping[reference] != allocation:
                raise RuntimeError('a fresh detached Version has multiple stash identities')
            mapping[reference] = allocation
    return mapping


def history(data):
    result = []
    for line in data.decode().splitlines(keepends=True):
        timestamp, pid, command = line.split(' ', 2)
        datetime.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        if not pid.isdecimal():
            raise RuntimeError('invalid command history PID')
        result.append(command)
    return ''.join(result).encode()


def bitmap_history(root):
    local_scope = scope(root)
    directory = local_scope / 'bitmap-history'
    metadata = local_scope / 'bitmap-history-metadata.txt'
    backups = {}
    if directory.exists():
        for path in sorted(directory.iterdir()):
            if not path.is_file() or path.is_symlink():
                raise RuntimeError('nonregular bitmap history snapshot')
            backups[path.name] = [path.stat().st_mode & 0o7777, sha(path.read_bytes())]
    return {'backups': backups, 'metadata': metadata.read_bytes().decode() if metadata.exists() else '',
            'metadata_mode': metadata.stat().st_mode & 0o7777 if metadata.exists() else None,
            'directory_mode': directory.stat().st_mode & 0o7777 if directory.exists() else None}


def qualified_bitmap_history(root, baseline):
    current = bitmap_history(root)
    for name, snapshot in baseline['backups'].items():
        if current['backups'].get(name) != snapshot:
            raise RuntimeError(f'baseline bitmap backup changed: {name}')
    if not current['metadata'].startswith(baseline['metadata']):
        raise RuntimeError('baseline bitmap history metadata changed')
    if baseline['metadata_mode'] is not None and current['metadata_mode'] != baseline['metadata_mode']:
        raise RuntimeError('baseline bitmap metadata mode changed')
    reasons, sequence, identities = [], [], set()
    appended = current['metadata'][len(baseline['metadata']):]
    if appended and appended != ''.join(line + '\n' for line in appended.splitlines()):
        raise RuntimeError('bitmap history metadata newline serialization changed')
    for line in appended.splitlines():
        identity, reason = line.split(' ', 1)
        if not re.fullmatch(r'\d{4}(?:-\d+){5}', identity):
            raise RuntimeError('invalid bitmap history timestamp filename')
        datetime.datetime(*map(int, identity.split('-')))
        filename = '.bitmap-' + identity
        if filename in baseline['backups']:
            raise RuntimeError('fresh bitmap history overwrote a baseline snapshot')
        snapshot = current['backups'][filename]
        identities.add(filename)
        reasons.append(reason)
        if not sequence or sequence[-1] != snapshot:
            sequence.append(snapshot)
    if set(current['backups']) - set(baseline['backups']) != identities:
        raise RuntimeError('unreferenced fresh bitmap history snapshot')
    return {'baseline': baseline, 'metadata_mode': current['metadata_mode'],
            'directory_mode': current['directory_mode'], 'fresh_reasons': reasons,
            'fresh_distinct_snapshot_sequence': sequence,
            'last_snapshot': sequence[-1] if sequence else None}


def cache_index(data):
    """Validate cacache index checksums and compare latest effective receipts per key."""
    entries = {}
    for line in data.decode().splitlines():
        if not line:
            continue
        checksum, serialized = line.split('\t', 1)
        if hashlib.sha1(serialized.encode()).hexdigest() != checksum:
            raise RuntimeError('invalid detection-cache index checksum')
        entry = json.loads(serialized)
        timestamps = [entry.pop('time')]
        if 'timestamp' in entry.get('metadata', {}):
            timestamps.append(entry['metadata'].pop('timestamp'))
        for value in timestamps:
            if not isinstance(value, (int, float)) or value < 0:
                raise RuntimeError('invalid detection-cache timestamp')
        entries[entry['key']] = entry
    return json.dumps(entries, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def tree(root, mapping=None, workspace=False, globals_directory=False):
    mapping = mapping or {}
    result = {'.': ['directory', root.stat().st_mode & 0o7777]}
    history_ids = {}
    if workspace:
        local_scope = scope(root)
        for directory in ['workspace-config-history/files']:
            for path in sorted((local_scope / directory).glob('*')):
                identity = path.name.removeprefix('.bitmap-')
                if re.fullmatch(r'\d{4}(?:-\d+){5}', identity):
                    history_ids.setdefault(identity, f'HISTORY_{len(history_ids)}')
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        parts = relative.parts
        # Immutable objects are decoded and compared separately, including their headers.
        if workspace and (path == scope(root) / 'objects' or (scope(root) / 'objects') in path.parents):
            continue
        if workspace and ((scope(root) / 'bitmap-history') in path.parents
                          or path == scope(root) / 'bitmap-history-metadata.txt'):
            # Baseline-aware receipt below retains every original backup, all reasons,
            # and snapshot bytes/modes, allowing only identical clock-collided copies.
            continue
        # GLOBAL_LOGS is exactly BIT_GLOBALS_DIR/logs; a component's logs/debug.log is data.
        if globals_directory and parts[0] == 'logs':
            continue
        if workspace and relative == Path('debug.log'):
            continue
        mode = path.lstat().st_mode & 0o7777
        if path.is_symlink():
            result[relative.as_posix()] = ['symlink', mode, os.readlink(path)]
        elif path.is_dir():
            result[relative.as_posix()] = ['directory', mode]
        else:
            data = path.read_bytes()
            if path.name == 'command-history':
                data = history(data)
            if workspace:
                for kind in ['deps', 'docs']:
                    index = scope(root) / 'cache/components' / kind / 'index-v5'
                    if index in path.parents:
                        data = cache_index(data)
            if workspace and 'stash' in parts and path.name.startswith('stash-'):
                value = json.loads(data)
                for row in value['stashCompsData']:
                    allocation = mapping.get(row['hash'])
                    if allocation:
                        row['hash'] = allocation['marker']
                data = json.dumps(value, indent=4, ensure_ascii=False).encode()
            key = relative.as_posix()
            if workspace and ('bitmap-history' in parts or 'workspace-config-history' in parts):
                for identity, marker in history_ids.items():
                    key = key.replace(identity, marker)
                    if path.name in {'bitmap-history-metadata.txt', 'metadata.txt'}:
                        data = data.replace(identity.encode(), marker.encode())
            elif workspace and path.name == 'bitmap-history-metadata.txt':
                for identity, marker in history_ids.items():
                    data = data.replace(identity.encode(), marker.encode())
            result[key] = ['file', mode, sha(data)]
    return result


def state(root, baseline_objects, baseline_history, *, history_projection=None):
    found = objects(root)
    mapping = detached_mapping(root, baseline_objects)
    projected = {}
    for reference, (kind, body, mode, prefix_mode) in found.items():
        allocation = mapping.get(reference)
        marker = allocation['marker'] if allocation else reference
        modes = {'file': mode, 'prefix_directory': prefix_mode}
        if reference in baseline_objects:
            if (kind, body, mode, prefix_mode) != baseline_objects[reference]:
                raise RuntimeError(f'existing repository object changed: {reference}')
            projected[marker] = [kind, sha(body), modes]
        elif kind == 'Version':
            if reference not in mapping:
                raise RuntimeError(f'unidentified detached Version allocation: {reference}')
            value = json.loads(body)
            if allocation['is_new']:
                date = value['log'].pop('date', None)
                if date is not None and not str(date).isdecimal():
                    raise RuntimeError('detached Version log date is not a timestamp')
            # Existing parents, dependency refs, Sources and every other Version field stay exact.
            projected[marker] = [kind, value, modes]
        else:
            projected[marker] = [kind, sha(body), modes]
    missing = baseline_objects.keys() - found.keys()
    if missing:
        raise RuntimeError(f'baseline repository objects were removed: {sorted(missing)}')
    directory = scope(root) / 'objects'
    empty = {path.name: path.stat().st_mode & 0o7777 for path in directory.iterdir()
             if path.is_dir() and not any(path.iterdir())}
    return {'tree': tree(root, mapping, workspace=True), 'objects': projected,
            'objects_directory_mode': directory.stat().st_mode & 0o7777,
            'empty_object_prefixes': empty,
            'bitmap_history': (qualified_bitmap_history(root, baseline_history)
                               if history_projection is None else history_projection)}


def normalized(data):
    data = re.sub(rb'(?m)^bit-native:[^\n]*(?:\r?\n|$)', b'', data)
    return re.sub(rb'\(completed in [0-9.]+(?:ns|\xce\xbcs|\xc2\xb5s|ms|s)\)',
                  b'(completed in <duration>)', data).decode()
