import chalk from 'chalk';
import { dependents, DependentsResults } from '../../../api/consumer/lib/dependents';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import { generateDependentsInfoTable } from '../../templates/component-template';

export default class Dependents implements LegacyCommand {
  name = 'dependents <component-name>';
  helpUrl = 'docs/dependencies/inspecting-dependencies#review-dependents';
  arguments = [
    {
      names: 'component-name',
      description: 'component name or component id',
    },
  ];
  description = 'EXPERIMENTAL. show dependents of the given component';
  group: Group = 'info';
  alias = '';
  opts = [] as CommandOptions;

  action([id]: [string]): Promise<any> {
    return dependents(id);
  }

  report(results: DependentsResults): string {
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
}
