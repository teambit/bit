import chalk from 'chalk';
import archy from 'archy';
import { dependencies, DependenciesResultsDebug, DependenciesResults } from '../../../api/consumer/lib/dependencies';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import { generateDependenciesInfoTable } from '../../templates/component-template';
import { IdNotFoundInGraph } from '../../../scope/exceptions/id-not-found-in-graph';
import DependencyGraph from '../../../scope/graph/scope-graph';

type DependenciesFlags = {
  debug: boolean;
  tree: boolean;
};

export default class Dependencies implements LegacyCommand {
  name = 'dependencies <component-name>';
  arguments = [{ name: 'component-name', description: 'component name or component id' }];
  group: Group = 'info';
  description = 'EXPERIMENTAL. show direct and indirect dependencies of the given component';
  alias = '';
  opts = [
    ['t', 'tree', 'render dependencies as a tree, similar to "npm ls"'],
    ['d', 'debug', 'show the immediate dependencies and how their version was determined'],
  ] as CommandOptions;

  async action([id]: [string], { debug = false, tree = false }: DependenciesFlags): Promise<any> {
    const results = await dependencies(id, debug);
    return { results, debug, tree };
  }

  report({
    results,
    debug,
    tree,
  }: {
    results: DependenciesResultsDebug | DependenciesResults;
  } & DependenciesFlags): string {
    // @ts-ignore
    if (debug) {
      return this.debugReport(results as DependenciesResultsDebug);
    }
    return this.nonDebugReport(results as DependenciesResults, tree);
  }

  private debugReport(results: DependenciesResultsDebug) {
    return JSON.stringify(results, undefined, 4);
  }

  private nonDebugReport(results: DependenciesResults, tree: boolean) {
    if (tree) {
      const idWithVersion = results.workspaceGraph._getIdWithLatestVersion(results.id);
      const getGraphAsTree = (graph: DependencyGraph) => {
        try {
          const graphAsTree = graph.getDependenciesAsObjectTree(idWithVersion.toString());
          return archy(graphAsTree);
        } catch (err: any) {
          if (err.constructor.name === 'RangeError') {
            return `${chalk.red('unable to generate a tree representation, the graph is too big or has cycles')}`;
          }
          throw err;
        }
      };
      const workspaceTree = getGraphAsTree(results.workspaceGraph);
      const scopeTree = getGraphAsTree(results.scopeGraph);
      return `${chalk.green('workspace')}:\n${workspaceTree}\n\n${chalk.green('scope')}:\n${scopeTree}`;
    }
    const workspaceGraph = results.workspaceGraph.getDependenciesInfo(results.id);
    const getScopeDependencies = () => {
      try {
        return results.scopeGraph.getDependenciesInfo(results.id);
      } catch (err) {
        if (err instanceof IdNotFoundInGraph) return []; // component might be new
        throw err;
      }
    };
    const scopeGraph = getScopeDependencies();
    if (!scopeGraph.length && !workspaceGraph.length) {
      return `no dependents found for ${results.id.toString()}.
try running "bit cat-component ${results.id.toStringWithoutVersion()}" to see whether the component/version exists locally`;
    }

    const scopeTable = generateDependenciesInfoTable(scopeGraph, results.id);
    const workspaceTable = generateDependenciesInfoTable(workspaceGraph, results.id);
    return `${chalk.bold('Dependencies originated from workspace')}
${workspaceTable || '<none>'}

${chalk.bold('Dependencies originated from scope')}
${scopeTable || '<none>'}`;
  }
}
