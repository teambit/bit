import path from 'path';
import fs from 'fs-extra';
import symlinkDir from 'symlink-dir';
import resolveLinkTarget from 'resolve-link-target';
import { logger, printWarning } from '@teambit/legacy.logger';

/**
 * Hard link all files from a directory to several target directories.
 *
 * @param src - The directory to hard link files from.
 * @param destDirs - The target directories.
 */
export async function hardLinkDirectory(src: string, destDirs: string[]) {
  if (destDirs.length === 0) return;
  const files = await fs.readdir(src, { withFileTypes: true });
  await Promise.all(
    files.map(async (file) => {
      if (file.name === 'node_modules') return;
      let srcFile = path.join(src, file.name);
      if (file.isDirectory()) {
        const destSubdirs = await Promise.all(
          destDirs.map(async (destDir) => {
            const destSubdir = path.join(destDir, file.name);
            await ensureDir(destSubdir);
            return destSubdir;
          })
        );
        await hardLinkDirectory(srcFile, destSubdirs);
        return;
      }
      if (file.isSymbolicLink()) {
        srcFile = await resolveLinkTarget(srcFile);
        let srcStats: fs.Stats;
        try {
          srcStats = await fs.stat(srcFile);
        } catch (err) {
          // if the link is broken, ignore it
          if (errnoCode(err) === 'ENOENT') return;
          throw err;
        }
        if (srcStats.isDirectory()) {
          await Promise.all(
            destDirs.map(async (destDir) => {
              const destSubdir = path.join(destDir, file.name);
              await symlinkDir(srcFile, destSubdir);
            })
          );
          return;
        }
      }
      await Promise.all(
        destDirs.map(async (destDir) => {
          const destFile = path.join(destDir, file.name);
          try {
            await linkFile(srcFile, destFile);
          } catch (err) {
            if (errnoCode(err) === 'ENOENT') {
              // broken symlinks are skipped
              return;
            }
            throw err;
          }
        })
      );
    })
  );
}

async function linkFile(srcFile: string, destFile: string) {
  try {
    await fs.link(srcFile, destFile);
  } catch (err) {
    const code = errnoCode(err);
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      await ensureDir(path.dirname(destFile));
      await linkFileIfNotExists(srcFile, destFile);
      return;
    }
    if (code !== 'EEXIST') {
      throw err;
    }
  }
}

async function linkFileIfNotExists(srcFile: string, destFile: string) {
  try {
    await fs.link(srcFile, destFile);
  } catch (err) {
    if (errnoCode(err) !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * Like `fs.mkdir(dir, { recursive: true })`, but recovers from a corrupted node_modules
 * tree where some ancestor of `dir` exists as a regular file or a non-directory symlink
 * (which causes `mkdir` to throw `ENOTDIR` or `ENOENT` through a broken symlink). The
 * blocking entry is moved aside (not deleted — the offender could be high up the tree
 * and we don't want to discard the user's data) and `mkdir` is retried.
 */
async function ensureDir(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true });
    return;
  } catch (err) {
    // ENOTDIR: a regular file blocks the path. EEXIST: leaf already exists as a non-directory
    // (rare with recursive: true). ENOENT: a dangling symlink in the path can't be traversed.
    const code = errnoCode(err);
    if (code !== 'ENOTDIR' && code !== 'EEXIST' && code !== 'ENOENT') throw err;
    const offender = await findNonDirectoryAncestor(dir);
    if (offender == null) {
      // EEXIST with a directory already at `dir` is benign — recursive mkdir normally
      // swallows it, but be defensive against races.
      if (code === 'EEXIST') return;
      throw err;
    }
    const quarantined = await quarantineStrayEntry(offender);
    const msg =
      `non-directory entry at ${offender} blocked link target ${dir}; ` +
      `moved aside to ${quarantined} so the install could continue. inspect or delete it manually if it isn't expected.`;
    logger.warn(msg);
    printWarning(msg);
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Rename `offender` to a sibling path that won't collide with anything bit creates.
 * On the rare chance the suffixed name already exists (e.g. a previous recovery in the
 * same millisecond, or a leftover from a prior failed run), keep bumping a counter.
 */
async function quarantineStrayEntry(offender: string): Promise<string> {
  const base = `${offender}.bit-stray-${Date.now()}`;
  let candidate = base;
  for (let i = 1; ; i++) {
    try {
      await fs.rename(offender, candidate);
      return candidate;
    } catch (err) {
      if (errnoCode(err) !== 'EEXIST' && errnoCode(err) !== 'ENOTEMPTY') throw err;
      candidate = `${base}-${i}`;
    }
  }
}

/**
 * Walk up from `dir` until we find an existing path component. If that component is not
 * a directory, return it (it's the entry blocking `mkdir`). Otherwise return null.
 */
async function findNonDirectoryAncestor(dir: string): Promise<string | null> {
  let current = dir;
  while (current && path.dirname(current) !== current) {
    let stat: fs.Stats;
    try {
      stat = await fs.lstat(current);
    } catch (err) {
      const code = errnoCode(err);
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        current = path.dirname(current);
        continue;
      }
      throw err;
    }
    return stat.isDirectory() ? null : current;
  }
  return null;
}

function errnoCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}
