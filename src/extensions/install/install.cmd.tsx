import React from 'react';
import fs from 'fs-extra';
import path from 'path';
import execa from 'execa';
import { Color } from 'ink';
import { Command } from '../paper';
import { FailedToInstall } from './failed-to-install';
import { Workspace } from '../workspace';
import { PackageManager } from '../package-manager';

import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';

export default class InstallCmd implements Command {
  name = 'install';
  description = 'install all component dependencies';
  alias = 'in';
  group = 'development';
  shortDescription = '';
  options = [];

  constructor(private workspace: Workspace, private packageManager: PackageManager) {}

  // TODO: remove this ts-ignore
  // @ts-ignore
  async render() {
    try {
      const components = await this.workspace.list();
      const isolatedEnvs = await this.workspace.load(components.map(c => c.id.toString()));
      const packageManagerName = this.workspace.consumer.config.packageManager;

      const packageJson = await fs.readJson(path.join(process.cwd(), 'package.json'));
      packageJson.dependencies = packageJson.dependencies || {};
      isolatedEnvs.forEach(e => {
        const componentPackageName = componentIdToPackageName(e.capsule.config.bitId, '@bit');
        const depFilePath = `file:${e.capsule.wrkDir}`;
        packageJson.dependencies[componentPackageName] = depFilePath;
      });
      await fs.writeFile(path.join(process.cwd(), 'package.json'), JSON.stringify(packageJson, null, 2));

      await this.packageManager.runInstallInFolder(process.cwd(), {
        packageManager: packageManagerName
      });
      return <Color green>Successfully installed {isolatedEnvs.length} component(s)</Color>;
    } catch (e) {
      throw new FailedToInstall(e.message);
    }
  }
}
