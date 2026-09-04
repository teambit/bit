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
    if (code === 'EXDEV') {
      // hard links can't cross devices (e.g. bind mounts or overlayfs on CI), fall back to copying
      await fs.copyFile(srcFile, destFile);
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
    const code = errnoCode(err);
    if (code === 'EXDEV') {
      await fs.copyFile(srcFile, destFile);
      return;
    }
    if (code !== 'EEXIST') {
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
  let mkdirError: unknown;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await fs.mkdir(dir, { recursive: true });
      return;
    } catch (err) {
      mkdirError = err;
    }

    // ENOTDIR: a regular file blocks the path. EEXIST: leaf already exists as a non-directory
    // (rare with recursive: true). ENOENT: a dangling symlink in the path can't be traversed.
    const code = errnoCode(mkdirError);
    if (code !== 'ENOTDIR' && code !== 'EEXIST' && code !== 'ENOENT') throw mkdirError;
    const offender = await findNonDirectoryAncestor(dir);
    if (offender == null) {
      // EEXIST with a directory already at `dir` is benign — recursive mkdir normally
      // swallows it, but be defensive against races.
      if (code === 'EEXIST') return;
      // Another worker may have already moved the offender. Retry mkdir against the new state.
      continue;
    }
    const quarantined = await quarantineStrayEntry(offender);
    // Another worker already quarantined this entry. Retry mkdir against the new state.
    if (quarantined == null) continue;
    const msg =
      `non-directory entry at ${offender} blocked link target ${dir}; ` +
      `moved aside to ${quarantined} so the install could continue. inspect or delete it manually if it isn't expected.`;
    logger.warn(msg);
    printWarning(msg);
  }
  throw mkdirError;
}

/**
 * Move `offender` to a sibling path that won't collide with anything bit creates.
 * On the rare chance the suffixed name already exists (e.g. a previous recovery in the
 * same millisecond, or a leftover from a prior failed run), keep bumping a counter.
 * Returns undefined when another worker already moved the offender.
 */
async function quarantineStrayEntry(offender: string): Promise<string | undefined> {
  const base = `${offender}.bit-stray-${Date.now()}`;
  let candidate = base;
  for (let i = 1; ; i++) {
    try {
      await moveNonDirectoryEntryNoReplace(offender, candidate);
      return candidate;
    } catch (err) {
      const code = errnoCode(err);
      if (code === 'ENOENT') return undefined;
      if (code !== 'EEXIST') throw err;
      candidate = `${base}-${i}`;
    }
  }
}

/**
 * Move a file or symlink without replacing an existing destination. Hard-linking a file and
 * recreating a symlink are atomic no-clobber operations, unlike rename on POSIX.
 */
async function moveNonDirectoryEntryNoReplace(src: string, dest: string) {
  const stat = await fs.lstat(src);
  if (stat.isSymbolicLink()) {
    const target = await fs.readlink(src);
    await fs.symlink(target, dest);
  } else {
    await fs.link(src, dest);
  }

  try {
    await fs.unlink(src);
  } catch (err) {
    // A concurrent worker may have removed src after we created dest. Remove our duplicate,
    // then let the caller retry directory creation.
    await fs.unlink(dest).catch(() => undefined);
    throw err;
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
