import path from 'path';
import fs from 'fs-extra';
import symlinkDir from 'symlink-dir';
import resolveLinkTarget from 'resolve-link-target';

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
            try {
              await fs.mkdir(destSubdir, { recursive: true });
            } catch (err: any) {
              if (err.code !== 'EEXIST') throw err;
            }
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
            await linkFile(srcFile, destFile);
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

async function linkFile(srcFile: string, destFile: string) {
  try {
    await fs.link(srcFile, destFile);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      await fs.mkdir(path.dirname(destFile), { recursive: true });
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
