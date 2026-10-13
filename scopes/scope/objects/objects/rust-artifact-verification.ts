import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';

type File = { filename: string; sha256: string; limit: number; bytes?: number };
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const verified = new Map<string, string>();

function stamps(files: File[]): string {
  return JSON.stringify(
    files.map((file) => {
      const stat = fs.lstatSync(file.filename, { bigint: true });
      if (
        !stat.isFile() ||
        stat.size > BigInt(file.limit) ||
        (file.bytes !== undefined && stat.size !== BigInt(file.bytes))
      )
        throw new Error('invalid packaged file');
      return [fs.realpathSync(file.filename), stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String);
    })
  );
}

/** Optional owner-private hint. Hosts without POSIX ownership checks always hash the files. */
function cacheFile(key: string): string | undefined {
  if (!process.getuid) return undefined;
  try {
    const root = process.env.BIT_GLOBALS_DIR || require('@teambit/legacy.constants').CACHE_ROOT;
    const directory = path.join(root, 'rust-artifact-verification-v1');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) return undefined;
    return path.join(directory, key);
  } catch {
    return undefined;
  }
}

function cached(filename: string | undefined, fingerprint: string): boolean {
  if (!filename) return false;
  try {
    const stat = fs.lstatSync(filename);
    return (
      stat.isFile() &&
      stat.uid === process.getuid!() &&
      (stat.mode & 0o077) === 0 &&
      stat.size === 64 &&
      fs.readFileSync(filename, 'utf8') === fingerprint
    );
  } catch {
    return false;
  }
}

function remember(filename: string | undefined, fingerprint: string) {
  if (!filename) return;
  const temporary = `${filename}.${process.pid}.${randomBytes(8).toString('hex')}`;
  try {
    fs.writeFileSync(temporary, fingerprint, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, filename);
  } catch {
    // Read-only installations and concurrent writers must not affect native selection.
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch {
      // A successful rename has already removed the temporary entry.
    }
  }
}

/** Reuse only successful hashes of unchanged files; a miss or unusable cache rechecks every byte. */
export function verifyPackagedFiles(files: File[]): boolean {
  if (files.some((file) => !/^[a-f0-9]{64}$/.test(file.sha256))) return false;
  const before = stamps(files);
  const key = digest(JSON.stringify(files.map((file) => path.resolve(file.filename))));
  const fingerprint = digest(JSON.stringify([files, before]));
  if (verified.get(key) === fingerprint) return true;
  const cache = cacheFile(key);
  if (!cached(cache, fingerprint)) {
    for (const file of files) {
      const bytes = fs.readFileSync(file.filename);
      if (bytes.length > file.limit || digest(bytes) !== file.sha256) return false;
    }
    // Do not cache a successful hash if a file changed during verification.
    if (stamps(files) !== before) return false;
    remember(cache, fingerprint);
  }
  verified.set(key, fingerprint);
  return true;
}
