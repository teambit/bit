import chalk from 'chalk';
import { dependencies, DependenciesResultsDebug, DependenciesResults } from '../../../api/consumer/lib/dependencies';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import { generateDependenciesInfoTable } from '../../templates/component-template';

export default class Dependencies implements LegacyCommand {
  name = 'dependencies <id>';
  group: Group = 'info';
  description = 'EXPERIMENTAL. show dependencies (direct and indirect) of the given component';
  alias = '';
  opts = [['d', 'debug', 'show the immediate dependencies and how their version was determined']] as CommandOptions;

  action([id]: [string], { debug = false }: { debug: boolean }): Promise<any> {
    return dependencies(id, debug);
  }

  report(results: DependenciesResultsDebug | DependenciesResults): string {
    // @ts-ignore
    if (!results.id) {
      // it's DependenciesResultsDebug
      return this.debugReport(results as DependenciesResultsDebug);
    }
    return this.nonDebugReport(results as DependenciesResults);
  }

  private debugReport(results: DependenciesResultsDebug) {
    return JSON.stringify(results, undefined, 4);
  }

  private nonDebugReport(results: DependenciesResults) {
    if (!results.scopeDependencies.length && !results.workspaceDependencies.length) {
      return `no dependents found for ${results.id.toString()}.
try running "bit cat-component ${results.id.toStringWithoutVersion()}" to see whether the component/version exists locally`;
    }
    const scopeTable = generateDependenciesInfoTable(results.scopeDependencies, results.id);
    const workspaceTable = generateDependenciesInfoTable(results.workspaceDependencies, results.id);
    return `${chalk.bold('Dependents originated from workspace')}
${workspaceTable || '<none>'}

${chalk.bold('Dependents originated from scope')}
${scopeTable || '<none>'}`;
  }
}
