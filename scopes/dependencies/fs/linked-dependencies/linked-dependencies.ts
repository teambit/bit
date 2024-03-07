import path from 'path';
import { createLinkOrSymlink } from '@teambit/toolbox.fs.link-or-symlink';

type CreateLinksOpts = {
  componentId?: string;
  avoidHardLink?: boolean;
  skipIfSymlinkValid?: boolean;
};

export async function createLinks(rootDir: string, linkedDeps: Record<string, string>, opts: CreateLinksOpts = {}) {
  const modulesDir = path.join(rootDir, 'node_modules');
  await Promise.all(
    Object.entries(linkedDeps).map(([packageName, linkPath]) =>
      createLinkOrSymlink(
        linkPath.substring(5),
        path.join(modulesDir, packageName),
        opts.componentId,
        opts.avoidHardLink,
        opts.skipIfSymlinkValid
      )
    )
  );
}
