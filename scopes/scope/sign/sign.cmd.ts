import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { BuildStatus } from 'bit-bin/dist/constants';
import { SignMain } from './sign.main.runtime';
import { BitError } from '../../../src/error/bit-error';

export class SignCmd implements Command {
  name = 'sign [component...]';
  description = 'complete the build process for components';
  alias = '';
  group = 'component';
  options = [] as CommandOptions;

  constructor(private signMain: SignMain, private scope: ScopeMain, private workspace?: Workspace) {}

  async report([components]: [string[]]) {
    const compIds = await this.getComponentIdsToSign(components);
    if (!compIds.length) return chalk.bold(`no pending-build components were found`);
    const results = await this.signMain.sign(compIds);
    const status = results.error ? BuildStatus.Failed : BuildStatus.Succeed;
    const error = results.error ? `${results.error}\n\n` : '';
    const color = error ? 'red' : 'green';
    const signed = `signed total ${results.components.length} components, with build-status ${status}`;
    return error + chalk.bold[color](signed);
  }

  async getComponentIdsToSign(ids: string[]): Promise<ComponentID[]> {
    if (ids.length) {
      const compIds = await this.scope.resolveMultipleComponentIds(ids);
      const components = await this.scope.getMany(compIds);
      components.forEach((component) => {
        if (component.state._consumer.buildStatus !== BuildStatus.Pending) {
          throw new BitError(`unable to sign "${component.id.toString()}" its build-status is not "pending"`);
        }
      });
      return compIds;
    }
    if (!this.workspace) {
      throw new Error('please specify component ids to sign');
    }
    const allComponents = await this.workspace.list();
    const buildPending = allComponents.filter((comp) => comp.state._consumer.buildStatus === BuildStatus.Pending);
    return buildPending.map((comp) => comp.id);
  }
}
