import fs from 'fs-extra';
import path from 'path';

/**
 * Currently, the same capsule directory is used multiple times during installation.
 * The issue is that the state between installations is not preserved,
 * so the node_modules directory gets broken on each sunseqent install.
 * This function is for finding all components in the root of the capsule and reading their manifests.
 * This way the package manager will have all the necessary information to keep the node_modules directory
 * in the correct state.
 */
export async function extendWithComponentsFromDir(rootDir: string, manifestsByPaths) {
  const files = await fs.readdir(rootDir, { withFileTypes: true });
  const newManifestsByPaths = { ...manifestsByPaths };
  await Promise.all(
    files
      .filter((file) => file.isDirectory() && file.name !== 'node_modules')
      .map((dir) => path.join(rootDir, dir.name))
      .filter((dirPath) => !manifestsByPaths[dirPath])
      .map(async (dirPath) => {
        try {
          newManifestsByPaths[dirPath] = await fs.readJson(path.join(dirPath, 'package.json'));
        } catch (err: any) {
          if (err.code !== 'ENOENT') throw err;
        }
      })
  );
  return newManifestsByPaths;
}
