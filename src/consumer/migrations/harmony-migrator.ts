import chalk from 'chalk';
import { Consumer } from '..';
import { COMPONENT_ORIGINS } from '../../constants';
import logger from '../../logger/logger';
import { individualFilesDesc } from '../../cli/commands/public-cmds/status-cmd';
import GeneralError from '../../error/general-error';

type MigrateResult = { individualFiles: string[]; changedToRootDir: string[] };

export class HarmonyMigrator {
  constructor(private consumer: Consumer) {}

  migrate(): MigrateResult {
    this.throwOnLegacy();
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
    return status;
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
    logger.console(
      chalk.white.bold('\nplease run "bit status" to make sure the workspace is error-free before continue working')
    );
  }
}
