import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { dependents, DependentsResults } from './dependents';
import { generateDependentsInfoTable } from './template';
import { Workspace } from '@teambit/workspace';

export class DependentsCmd implements Command {
  name = 'dependents <component-name>';
  helpUrl = 'reference/dependencies/inspecting-dependencies#review-dependents';
  arguments = [
    {
      name: 'component-name',
      description: 'component name or component id',
    },
  ];
  description = 'show dependents of the given component';
  group = 'info';
  alias = '';
  options = [['j', 'json', 'return the dependents in JSON format']] as CommandOptions;

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
