import fs from 'fs-extra';
import path from 'path';
import { FailedToInstall } from './failed-to-install';
import { Workspace } from '../workspace';
import { PackageManager } from '../package-manager';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import { DEFAULT_REGISTRY_DOMAIN_PREFIX } from '../../constants';

export class Install {
  constructor(private workspace: Workspace, private packageManager: PackageManager) {}
  async install() {
    try {
      const components = await this.workspace.list();
      const isolatedEnvs = await this.workspace.load(components.map(c => c.id.toString()));
      const packageManagerName = this.workspace.consumer.config.packageManager;

      const packageJson = await fs.readJson(path.join(process.cwd(), 'package.json'));
      packageJson.dependencies = packageJson.dependencies || {};
      isolatedEnvs.forEach(e => {
        const componentPackageName = componentIdToPackageName(e.capsule.config.bitId, DEFAULT_REGISTRY_DOMAIN_PREFIX);
        const depFilePath = `file:${e.capsule.wrkDir}`;
        packageJson.dependencies[componentPackageName] = depFilePath;
      });
      await fs.writeFile(path.join(process.cwd(), 'package.json'), JSON.stringify(packageJson, null, 2));

      await this.packageManager.runInstallInFolder(process.cwd(), {
        packageManager: packageManagerName
      });
      return isolatedEnvs;
    } catch (e) {
      throw new FailedToInstall(e.message);
    }
  }
}
