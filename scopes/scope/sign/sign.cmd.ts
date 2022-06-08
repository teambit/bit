import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component';
import { BuildStatus } from '@teambit/legacy/dist/constants';
import { SignMain } from './sign.main.runtime';

type SignOptions = { multiple: boolean; alwaysSucceed: boolean; push: boolean; lane?: string };
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
  ] as CommandOptions;

  constructor(private signMain: SignMain) {}

  async report([components = []]: [string[]], { multiple, alwaysSucceed, push, lane }: SignOptions) {
    const componentIds = components.map((c) => ComponentID.fromString(c));
    const results = await this.signMain.sign(componentIds, multiple, push, lane);
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
}
