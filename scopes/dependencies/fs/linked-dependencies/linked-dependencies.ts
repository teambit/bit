import path from 'path';
import { createSymlinkOrCopy } from '@teambit/legacy/dist/utils';

export async function createLinks(rootDir: string, linkedDeps: Record<string, string>) {
  const modulesDir = path.join(rootDir, 'node_modules');
  await Promise.all(
    Object.entries(linkedDeps).map(([packageName, linkPath]) =>
      createSymlinkOrCopy(linkPath.substring(5), path.join(modulesDir, packageName))
    )
  );
}
