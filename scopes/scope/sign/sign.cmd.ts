import chalk from 'chalk';
import { Logger } from '@teambit/logger';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component';
import { BuildStatus } from '@teambit/legacy/dist/constants';
import { getBitVersion } from '@teambit/bit.get-bit-version';
import { SignMain } from './sign.main.runtime';

export type SignOptions = {
  alwaysSucceed?: boolean;
  push?: boolean;
  lane?: string;
  rebuild?: boolean;
  originalScope?: boolean;
  saveLocally?: boolean;
};
export class SignCmd implements Command {
  name = 'sign [component...]';
  private = true;
  description = 'complete the build process for components';
  extendedDescription = `a new bare-scope needs to be created and it will import the components to this scope first`;
  alias = '';
  group = 'development';
  options = [
    ['', 'multiple', 'DEPRECATED. this is now the default. sign components from multiple scopes'],
    ['', 'always-succeed', 'exit with code 0 even though the build failed'],
    ['', 'push', 'export the updated objects to the original scopes once done'],
    ['', 'lane <lane-id>', 'helps to fetch the components from the lane scope (relevant for --multiple)'],
    ['', 'rebuild', 'allow signing components whose buildStatus is successful for testing purposes'],
    [
      '',
      'original-scope',
      'sign components from the original scope. works only when all components are from the same scope',
    ],
    ['', 'save-locally', 'save the signed components locally on the bare-scope for debugging purposes'],
  ] as CommandOptions;

  constructor(
    private signMain: SignMain,
    private logger: Logger
  ) {}

  async report([components = []]: [string[]], signOptions: SignOptions) {
    const harmonyVersion = getBitVersion();
    this.logger.console(`signing using ${harmonyVersion} version`); // eslint-disable-line no-console
    const componentIds = components.map((c) => ComponentID.fromString(c));
    this.warnForMissingVersions(componentIds);
    const { alwaysSucceed, lane } = signOptions;
    const results = await this.signMain.sign(componentIds, lane, signOptions);
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
