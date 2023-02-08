import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component';
import { BuildStatus } from '@teambit/legacy/dist/constants';
import { SignMain } from './sign.main.runtime';

type SignOptions = { multiple: boolean; alwaysSucceed: boolean; push: boolean; lane?: string; rebuild?: boolean };
export class SignCmd implements Command {
  name = 'sign [component...]';
  private = true;
  description = 'complete the build process for components';
  extendedDescription = `without --multiple, this will be running on the original scope.
with --multiple, a new bare-scope needs to be created and it will import the components to this scope first`;
  alias = '';
  group = 'development';
  options = [
    ['', 'multiple', 'sign components from multiple scopes'],
    ['', 'always-succeed', 'exit with code 0 even though the build failed'],
    ['', 'push', 'export the updated objects to the original scopes once done'],
    ['', 'lane <lane-id>', 'helps to fetch the components from the lane scope (relevant for --multiple)'],
    ['', 'rebuild', 'allow signing components that their buildStatus is success for testing purposes'],
  ] as CommandOptions;

  constructor(private signMain: SignMain) {}

  async report([components = []]: [string[]], { multiple, alwaysSucceed, push, lane, rebuild }: SignOptions) {
    const componentIds = components.map((c) => ComponentID.fromString(c));
    this.warnForMissingVersions(componentIds);
    if (push && rebuild) {
      throw new Error('you can not use --push and --rebuild together');
    }
    const results = await this.signMain.sign(componentIds, multiple, push, lane, rebuild);
    if (!results) {
      return chalk.bold('no more components left to sign');
    }
    const status = results.error ? BuildStatus.Failed : BuildStatus.Succeed;
    const error = results.error ? `${results.error}\n\n` : '';
    const color = error ? 'red' : 'green';
    const signed = `the following ${results.components.length} component(s) were signed with build-status "${status}"
${results.components.map((c) => c.id.toString()).join('\n')}`;
    return {
      data: error + chalk.bold[color](signed),
      code: error && !alwaysSucceed ? 1 : 0,
    };
  }

  private warnForMissingVersions(compIds: ComponentID[]) {
    const compIdsWithoutVer = compIds.filter((c) => !c.hasVersion());
    if (compIdsWithoutVer.length) {
      const compIdsStr = compIdsWithoutVer.map((c) => c.toString()).join(', ');
      // eslint-disable-next-line no-console
      console.warn(
        chalk.yellow(
          `the following component-id(s) don't have a version: ${compIdsStr}, as a result, it might sign the wrong version especially when running with lanes`
        )
      );
    }
  }
}
