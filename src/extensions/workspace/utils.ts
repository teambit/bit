import fs from 'fs-extra';
import path from 'path';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import { DEFAULT_REGISTRY_DOMAIN_PREFIX } from '../../constants';

export async function symlinkCapsulesInNodeModules(isolatedEnvs) {
  await Promise.all(
    isolatedEnvs.map(async e => {
      const componentPackageName = componentIdToPackageName(
        e.component.id.legacyComponentId,
        DEFAULT_REGISTRY_DOMAIN_PREFIX
      );
      const linkPath = path.join(process.cwd(), 'node_modules', componentPackageName);
      await fs.mkdirp(path.dirname(linkPath));
      await fs.symlink(e.capsule.wrkDir, linkPath);
    })
  );
}

export async function removeExistingLinksInNodeModules(isolatedEnvs) {
  await Promise.all(
    isolatedEnvs.map(async e => {
      const componentPackageName = componentIdToPackageName(
        e.component.id.legacyComponentId,
        DEFAULT_REGISTRY_DOMAIN_PREFIX
      );
      try {
        await fs.unlink(path.join(process.cwd(), 'node_modules', componentPackageName));
      } catch (err) {
        // if the symlink does not exist - no problem
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    })
  );
}
