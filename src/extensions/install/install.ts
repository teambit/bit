import fs from 'fs-extra';
import path from 'path';
import { Workspace } from '../workspace';
import { PackageManager } from '../package-manager';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import { DEFAULT_REGISTRY_DOMAIN_PREFIX } from '../../constants';

export class Install {
  constructor(private workspace: Workspace, private packageManager: PackageManager) {}
  async install() {
    const components = await this.workspace.list();
    const isolatedEnvs = await this.workspace.load(components.map(c => c.id.toString()));
    const packageManagerName = this.workspace.consumer.config.packageManager;
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

    await this.packageManager.runInstallInFolder(process.cwd(), {
      packageManager: packageManagerName
    });

    await Promise.all(
      isolatedEnvs.map(async e => {
        const componentPackageName = componentIdToPackageName(
          e.component.id.legacyComponentId,
          DEFAULT_REGISTRY_DOMAIN_PREFIX
        );
        const depFilePath = `file:${e.capsule.wrkDir}`;
        const linkPath = path.join(process.cwd(), 'node_modules', componentPackageName);
        await fs.mkdirp(path.dirname(linkPath));
        await fs.symlink(e.capsule.wrkDir, linkPath);
      })
    );

    return isolatedEnvs;
  }
}
