import { Command, CommandOptions } from '@teambit/cli';
import path from 'path';
import { ScopeMain } from '@teambit/scope';
import chalk from 'jest-matcher-utils/node_modules/chalk';
import { Config } from '@teambit/config';

export class UseCmd implements Command {
  name = 'use [ids...]';
  shortDescription = 'set up aspects in the workspace/scope config';
  group = 'collaborate';
  description = 'set up aspects in the workspace/scope config';
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;

  constructor(private scope: ScopeMain, private config: Config) {}

  async report([ids = []]: [string[]]): Promise<any> {
    const config = this.config.workspaceConfig || this.config.scopeConfig;
    if (!config) {
      throw new Error(`please run "bit use" from either a workspace or a scope`);
    }
    const componentIds = await this.scope.resolveMultipleComponentIds(ids);
    await this.scope.import(componentIds);
    componentIds.forEach((compId) => {
      config.setExtension(
        compId.toString(),
        {},
        {
          overrideExisting: false,
          ignoreVersion: false,
        }
      );
    });
    await config.write({ dir: path.dirname(config.path) });

    return chalk.green(`the following aspect(s) were saved into ${
      this.config.workspaceConfig ? 'workspace.jsonc' : 'scopes.jsonc'
    } file:
${componentIds.map((id) => id.toString()).join('\n')}`);
  }
}
