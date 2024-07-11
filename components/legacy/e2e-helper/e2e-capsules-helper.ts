import fs from 'fs-extra';
import CommandHelper from './e2e-command-helper';

export default class CapsulesHelper {
  command: CommandHelper;
  constructor(commandHelper: CommandHelper) {
    this.command = commandHelper;
  }

  removeScopeAspectCapsules() {
    const capsules = this.command.capsuleListParsed();
    const scopeAspectCapsulesPath = capsules.scopeAspectsCapsulesRootDir;
    fs.removeSync(scopeAspectCapsulesPath);
  }
}
