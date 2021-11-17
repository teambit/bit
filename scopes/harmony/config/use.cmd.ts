import { Command, CommandOptions } from '@teambit/cli';
import path from 'path';
import chalk from 'chalk';
import { ConfigMain } from '@teambit/config';

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

  constructor(private config: ConfigMain) {}

  async report([ids = []]: [string[]]): Promise<any> {
    const config = this.config.workspaceConfig || this.config.scopeConfig;
    if (!config) {
      throw new Error(`please run "bit use" from either a workspace or a scope`);
    }
    const preAddingAspectFunctions = this.config.preAddingAspectsSlot?.toArray();
    if (!preAddingAspectFunctions) throw new Error(`can't find any registration to the preAddingAspects slot`);
    const componentIds = (await Promise.all(preAddingAspectFunctions.map(([, func]) => func(ids)))).flat();

    componentIds.forEach((compId) => {
      config.setExtension(
        compId,
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
${componentIds.join('\n')}`);
  }
}
