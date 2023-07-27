import path from 'path';
import { createSymlinkOrCopy } from '@teambit/legacy/dist/utils';

type CreateLinksOpts = {
  componentId?: string | null | undefined;
  avoidHardLink?: boolean;
  skipIfSymlinkValid?: boolean;
};

export async function createLinks(rootDir: string, linkedDeps: Record<string, string>, opts: CreateLinksOpts = {}) {
  const modulesDir = path.join(rootDir, 'node_modules');
  await Promise.all(
    Object.entries(linkedDeps).map(([packageName, linkPath]) =>
      createSymlinkOrCopy(
        linkPath.substring(5),
        path.join(modulesDir, packageName),
        opts.componentId,
        opts.avoidHardLink,
        opts.skipIfSymlinkValid
      )
    )
  );
}
