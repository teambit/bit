import path from 'path';
import fs from 'fs-extra';
import symlinkDir from 'symlink-dir';
import resolveLinkTarget from 'resolve-link-target';
import { logger, printWarning } from '@teambit/legacy.logger';

export interface HardLinkDirectoryOptions {
  /**
   * Called when a non-directory entry is found at a path where a directory is expected
   * (e.g. an ancestor of a destination subdirectory has been replaced by a file or a
   * dangling symlink). The blocking entry is removed before retrying. Defaults to
   * writing the message to the bit log and printing it via `printWarning`.
   */
  onWarn?: (message: string) => void;
}

const defaultOnWarn = (message: string) => {
  logger.warn(message);
  printWarning(message);
};

/**
 * Hard link all files from a directory to several target directories.
 *
 * @param src - The directory to hard link files from.
 * @param destDirs - The target directories.
 * @param options - Optional behaviors. See {@link HardLinkDirectoryOptions}.
 */
export async function hardLinkDirectory(src: string, destDirs: string[], options: HardLinkDirectoryOptions = {}) {
  if (destDirs.length === 0) return;
  const onWarn = options.onWarn ?? defaultOnWarn;
  const files = await fs.readdir(src, { withFileTypes: true });
  await Promise.all(
    files.map(async (file) => {
      if (file.name === 'node_modules') return;
      let srcFile = path.join(src, file.name);
      if (file.isDirectory()) {
        const destSubdirs = await Promise.all(
          destDirs.map(async (destDir) => {
            const destSubdir = path.join(destDir, file.name);
            await ensureDir(destSubdir, onWarn);
            return destSubdir;
          })
        );
        await hardLinkDirectory(srcFile, destSubdirs, options);
        return;
      }
      if (file.isSymbolicLink()) {
        srcFile = await resolveLinkTarget(srcFile);
        let srcStats: fs.Stats;
        try {
          srcStats = await fs.stat(srcFile);
        } catch (err: any) {
          // if the link is broken, ignore it
          if (err.code === 'ENOENT') return;
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
            await linkFile(srcFile, destFile, onWarn);
          } catch (err: any) {
            if (err.code === 'ENOENT') {
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

async function linkFile(srcFile: string, destFile: string, onWarn: (message: string) => void) {
  try {
    await fs.link(srcFile, destFile);
  } catch (err: any) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
      await ensureDir(path.dirname(destFile), onWarn);
      await linkFileIfNotExists(srcFile, destFile);
      return;
    }
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

async function linkFileIfNotExists(srcFile: string, destFile: string) {
  try {
    await fs.link(srcFile, destFile);
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * Like `fs.mkdir(dir, { recursive: true })`, but recovers from a corrupted node_modules
 * tree where some ancestor of `dir` exists as a regular file or a non-directory symlink
 * (which causes `mkdir` to throw `ENOTDIR`). The blocking entry is removed and `mkdir`
 * is retried. The expected ancestors are package directories under `.bit_roots/<env>/...`,
 * which bit owns and rebuilds on every install — so deleting a stray entry is safe.
 */
async function ensureDir(dir: string, onWarn: (message: string) => void) {
  try {
    await fs.mkdir(dir, { recursive: true });
    return;
  } catch (err: any) {
    // ENOTDIR: a regular file blocks the path. EEXIST: leaf already exists as a non-directory
    // (rare with recursive: true). ENOENT: a dangling symlink in the path can't be traversed.
    if (err.code !== 'ENOTDIR' && err.code !== 'EEXIST' && err.code !== 'ENOENT') throw err;
    const offender = await findNonDirectoryAncestor(dir);
    if (offender == null) {
      // EEXIST with a directory already at `dir` is benign — recursive mkdir normally
      // swallows it, but be defensive against races.
      if (err.code === 'EEXIST') return;
      throw err;
    }
    onWarn(`removing non-directory entry blocking link target at ${offender} (expected directory ${dir})`);
    await fs.remove(offender);
    await fs.mkdir(dir, { recursive: true });
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
    } catch (err: any) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
        current = path.dirname(current);
        continue;
      }
      throw err;
    }
    return stat.isDirectory() ? null : current;
  }
  return null;
}
