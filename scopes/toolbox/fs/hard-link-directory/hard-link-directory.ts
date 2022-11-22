import path from 'path';
import fs from 'fs-extra';

/**
 * Hard link all files from a directory to several target directories.
 *
 * @param src - The directory to hard link files from.
 * @param destDirs - The target directories.
 */
export async function hardLinkDirectory(src: string, destDirs: string[]) {
  const files = await fs.readdir(src);
  await Promise.all(
    files.map(async (file) => {
      if (file === 'node_modules') return;
      const srcFile = path.join(src, file);
      if ((await fs.lstat(srcFile)).isDirectory()) {
        await Promise.all(
          destDirs.map(async (destDir) => {
            const destFile = path.join(destDir, file);
            try {
              await fs.mkdir(destFile, { recursive: true });
            } catch (err: any) {
              if (err.code !== 'EEXIST') throw err;
            }
            return hardLinkDirectory(srcFile, [destFile]);
          })
        );
        return;
      }
      await Promise.all(
        destDirs.map(async (destDir) => {
          const destFile = path.join(destDir, file);
          try {
            await fs.link(srcFile, destFile);
          } catch (err: any) {
            if (err.code === 'ENOENT') {
              await fs.mkdir(destDir, { recursive: true });
              await fs.link(srcFile, destFile);
              return;
            }
            if (err.code !== 'EEXIST') {
              throw err;
            }
          }
        })
      );
    })
  );
}
