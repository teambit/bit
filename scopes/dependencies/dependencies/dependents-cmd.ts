import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import type { DependentsResults } from './dependents';
import { dependents } from './dependents';
import { generateDependentsInfoTable } from './template';
import type { Workspace } from '@teambit/workspace';
import { dependentsCommand } from './dependencies.commands';

export class DependentsCmd implements Command {
  name = dependentsCommand.name;
  helpUrl = dependentsCommand.helpUrl;
  arguments = dependentsCommand.arguments;
  description = dependentsCommand.description;
  extendedDescription = dependentsCommand.extendedDescription;
  group = dependentsCommand.group;
  alias = dependentsCommand.alias;
  options = dependentsCommand.options;

  constructor(private workspace: Workspace) {}

  async report([id]: [string]) {
    const results: DependentsResults = await dependents(id, this.workspace);
    if (!results.scopeDependents.length && !results.workspaceDependents.length) {
      return `no dependents found for ${results.id.toString()}.
try running "bit cat-component ${results.id.toStringWithoutVersion()}" to see whether the component/version exists locally`;
    }
    const scopeTable = generateDependentsInfoTable(results.scopeDependents, results.id);
    const workspaceTable = generateDependentsInfoTable(results.workspaceDependents, results.id);
    return `${chalk.bold('Dependents originated from workspace')}
${workspaceTable || '<none>'}

${chalk.bold('Dependents originated from scope')}
${scopeTable || '<none>'}`;
  }

  async json([id]: [string]) {
    const results: DependentsResults = await dependents(id, this.workspace);
    const depInfoToString = (depInfo) => {
      return {
        ...depInfo,
        id: depInfo.id.toString(),
      };
    };
    return {
      scopeDependents: results.scopeDependents.map(depInfoToString),
      workspaceDependents: results.workspaceDependents.map(depInfoToString),
      id: results.id.toString(),
    };
  }
}
