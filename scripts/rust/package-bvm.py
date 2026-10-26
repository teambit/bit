#!/usr/bin/env python3
"""Add a native executable to a released bvm archive without changing its Node CLI."""
import argparse
import copy
import hashlib
import io
import json
import posixpath
from pathlib import Path, PurePosixPath
import re
import tarfile


def sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def package(base, binary, output, version, platform):
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', version):
        raise ValueError('version must be a bvm-compatible semantic version')
    executable = 'bit.exe' if platform == 'win' else 'bit'
    prefix = f'bit-{version}'
    output = Path(output)
    if output.exists():
        raise ValueError(f'output already exists: {output}')
    binary = Path(binary).resolve(strict=True)
    temporary = output.with_suffix(output.suffix + '.tmp')
    if temporary.exists():
        raise ValueError(f'temporary output already exists: {temporary}')
    found_entry = False
    found_manifest = False
    old_prefix = None
    try:
        with tarfile.open(base, 'r:*') as source, tarfile.open(temporary, 'w:gz', compresslevel=6) as target:
            for member in source:
                name = PurePosixPath(member.name)
                if (name.is_absolute() or '..' in name.parts or not name.parts
                        or '\\' in member.name or ':' in member.name):
                    raise ValueError(f'invalid archive path: {member.name}')
                if old_prefix is None:
                    old_prefix = name.parts[0]
                    if not old_prefix.startswith('bit-'):
                        raise ValueError(f'expected a bvm archive, found {old_prefix}')
                if name.parts[0] != old_prefix:
                    raise ValueError(f'archive has multiple roots: {member.name}')
                relative = PurePosixPath(*name.parts[1:]).as_posix()
                if relative in ('bin/bit', 'bin/bit.exe', 'native-release.json'):
                    raise ValueError(f'base archive already contains a native entry: {member.name}')
                if (member.issym() or member.islnk()) and (
                    PurePosixPath(member.linkname).is_absolute()
                    or '\\' in member.linkname or ':' in member.linkname
                ):
                    raise ValueError(f'absolute symlink cannot be relocated: {member.name}')
                if member.issym():
                    destination = PurePosixPath(posixpath.normpath(str(name.parent / member.linkname)))
                    if not destination.parts or destination.parts[0] != old_prefix:
                        raise ValueError(f'symlink leaves the archive: {member.name}')
                if not (member.isfile() or member.isdir() or member.issym() or member.islnk()):
                    raise ValueError(f'unsupported archive entry: {member.name}')
                copied = copy.copy(member)
                copied.name = str(PurePosixPath(prefix, *name.parts[1:]))
                if member.islnk():
                    link = PurePosixPath(member.linkname)
                    if not link.parts or '..' in link.parts or link.parts[0] != old_prefix:
                        raise ValueError(f'invalid hardlink: {member.name}')
                    copied.linkname = str(PurePosixPath(prefix, *link.parts[1:]))
                copied.uid = copied.gid = 0
                copied.uname = copied.gname = ''
                stream = source.extractfile(member) if member.isfile() else None
                target.addfile(copied, stream)
                found_entry |= relative == 'node_modules/@teambit/bit/bin/bit' and member.isfile()
                found_manifest |= relative == 'node_modules/@teambit/bit/package.json' and member.isfile()
            if not found_entry or not found_manifest:
                raise ValueError('base archive is missing the packaged Node CLI')
            entry = tarfile.TarInfo(f'{prefix}/bin/{executable}')
            entry.size = binary.stat().st_size
            entry.mode = 0o755
            with binary.open('rb') as stream:
                target.addfile(entry, stream)
            manifest = json.dumps({
                'version': version,
                'platform': platform,
                'binarySha256': sha256(binary),
                'baseArchiveSha256': sha256(base),
            }, indent=2).encode() + b'\n'
            entry = tarfile.TarInfo(f'{prefix}/native-release.json')
            entry.mode = 0o644
            entry.size = len(manifest)
            target.addfile(entry, io.BytesIO(manifest))
        temporary.rename(output)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, required=True, help='released bvm tar.gz archive')
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--version', required=True, help='distinct version for this native archive')
    parser.add_argument('--platform', choices=['linux', 'darwin', 'win'], required=True)
    args = parser.parse_args()
    package(args.base, args.binary, args.output, args.version, args.platform)


if __name__ == '__main__':
    main()
