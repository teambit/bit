import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component';
import { ScopeMain } from '@teambit/scope';
import { BuildStatus } from 'bit-bin/dist/constants';
import { Logger } from '@teambit/logger';
import { SignMain } from './sign.main.runtime';

export class SignCmd implements Command {
  name = 'sign <component...>';
  description = 'complete the build process for components';
  alias = '';
  group = 'component';
  options = [] as CommandOptions;

  constructor(private signMain: SignMain, private scope: ScopeMain, private logger: Logger) {}

  async report([components]: [string[]]) {
    const { componentsToSkip, componentsToSign } = await this.getComponentIdsToSign(components);
    if (componentsToSkip.length) {
      // eslint-disable-next-line no-console
      console.log(`the following component(s) were already signed successfully:
${componentsToSkip.map((c) => c.toString()).join('\n')}\n`);
    }
    if (!componentsToSign.length) {
      return chalk.bold('no more components left to sign');
    }
    const results = await this.signMain.sign(componentsToSign);
    const status = results.error ? BuildStatus.Failed : BuildStatus.Succeed;
    const error = results.error ? `${results.error}\n\n` : '';
    const color = error ? 'red' : 'green';
    const signed = `the following ${results.components.length} component(s) were signed with build-status "${status}"
${componentsToSign.map((c) => c.toString()).join('\n')}`;
    return {
      data: error + chalk.bold[color](signed),
      code: error ? 1 : 0,
    };
  }

  async getComponentIdsToSign(
    ids: string[]
  ): Promise<{
    componentsToSkip: ComponentID[];
    componentsToSign: ComponentID[];
  }> {
    const compIds = await this.scope.resolveMultipleComponentIds(ids);
    // using `loadComponents` instead of `getMany` to make sure component aspects are loaded.
    this.logger.setStatusLine(`loading ${ids.length} components and their extensions...`);
    const components = await this.scope.loadMany(compIds);
    const componentsToSign: ComponentID[] = [];
    const componentsToSkip: ComponentID[] = [];
    components.forEach((component) => {
      if (component.state._consumer.buildStatus === BuildStatus.Succeed) {
        componentsToSkip.push(component.id);
      } else {
        componentsToSign.push(component.id);
      }
    });
    return { componentsToSkip, componentsToSign };
  }
}
