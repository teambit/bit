import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

import { Consumer } from '..';
import { addFeature, HARMONY_FEATURE } from '../../api/consumer/lib/feature-toggle';
import { individualFilesDesc } from '../../cli/commands/public-cmds/status-cmd';
import { COMPONENT_ORIGINS, WORKSPACE_JSONC } from '../../constants';
import GeneralError from '../../error/general-error';
import logger from '../../logger/logger';
import PackageJsonFile from '../component/package-json-file';

type MigrateResult = { individualFiles: string[]; changedToRootDir: string[] };

export class HarmonyMigrator {
  private messages: string[] = [];
  constructor(private consumer: Consumer) {}

  async migrate() {
    await this.initAsHarmony();
    const status: MigrateResult = { individualFiles: [], changedToRootDir: [] };
    const authorComponents = this.consumer.bitMap.getAllComponents(COMPONENT_ORIGINS.AUTHORED);
    authorComponents.forEach((componentMap) => {
      if (componentMap.rootDir) return;
      if (!componentMap.trackDir) {
        status.individualFiles.push(componentMap.id.toStringWithoutVersion());
        return;
      }
      componentMap.changeRootDirAndUpdateFilesAccordingly(componentMap.trackDir);
      status.changedToRootDir.push(componentMap.id.toStringWithoutVersion());
      this.consumer.bitMap.markAsChanged();
    });
    this.printResults(status);
    this.printMessages();
  }
  private async initAsHarmony() {
    if (!this.consumer.isLegacy) return; // it's already Harmony.
    this.backupAndRemoveBitJson();
    await this.backupAndRemoveBitPropInPkgJson();
    addFeature(HARMONY_FEATURE);
    const workspacePath = this.consumer.getPath();
    // because Harmony feature is added, the load writes the workspace.jsonc because the configuration
    // files are now missing.
    const consumer = await Consumer.load(workspacePath);
    if (!fs.existsSync(path.join(workspacePath, WORKSPACE_JSONC))) {
      throw new Error('failed initializing the workspace as Harmony');
    }
    this.messages.push('congratulations! your workspace has been initialized as Harmony');
    this.consumer = consumer;
  }
  private async backupAndRemoveBitPropInPkgJson() {
    const packageJsonFile = await PackageJsonFile.load(this.consumer.getPath());
    if (!packageJsonFile.packageJsonObject.bit) return;
    packageJsonFile.packageJsonObject['bit-legacy'] = packageJsonFile.packageJsonObject.bit;
    delete packageJsonFile.packageJsonObject.bit;
    await packageJsonFile.write();
    this.messages.push(`Harmony doesn't work with the previous "bit" property in the package.json.
this property has been renamed to "bit-legacy". delete it once you don't need it.`);
  }
  private backupAndRemoveBitJson() {
    const bitJsonPath = path.join(this.consumer.getPath(), 'bit.json');
    if (!fs.existsSync(bitJsonPath)) return;
    fs.moveSync(bitJsonPath, `${bitJsonPath}.legacy`);
    this.messages.push(`Harmony doesn't work with your previous configuration file ${bitJsonPath}.
this file has been renamed to include ".legacy" suffix. delete it once you don't need it.`);
  }
  private throwOnLegacy() {
    if (this.consumer.isLegacy) {
      throw new GeneralError(`your workspace is working in legacy mode.
before starting the migration, please re-init the workspace as harmony by following these steps.
1. backup and remove your workspace settings (either bit.json or "bit" prop in package.json).
2. run "BIT_FEATURES=harmony bit init" (on Windows run "set BIT_FEATURES=harmony && bit init")`);
    }
  }
  private printResults(results: MigrateResult) {
    if (results.individualFiles.length) {
      logger.console(chalk.red(individualFilesDesc));
      logger.console(results.individualFiles.join('\n'));
    }
    if (results.changedToRootDir.length) {
      logger.console(chalk.green('the following components were successfully converted from trackDir to rootDir'));
      logger.console(results.changedToRootDir.join('\n'));
    }
    this.messages.push('please run "bit status" to make sure the workspace is error-free before continue working');
  }
  printMessages() {
    this.messages.forEach((message) => {
      logger.console(chalk.bold(`\n[-] ${message}`));
    });
  }
}
