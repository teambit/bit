// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import archy from 'archy';
import {
  dependencies,
  DependenciesResultsDebug,
  DependenciesResults,
} from '@teambit/legacy/dist/api/consumer/lib/dependencies';
import { generateDependenciesInfoTable } from '@teambit/legacy/dist/cli/templates/component-template';
import { IdNotFoundInGraph } from '@teambit/legacy/dist/scope/exceptions/id-not-found-in-graph';
import DependencyGraph from '@teambit/legacy/dist/scope/graph/scope-graph';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { DependenciesMain } from './dependencies.main.runtime';

type GetDependenciesFlags = {
  tree: boolean;
};

export type SetDependenciesFlags = {
  dev?: boolean;
  peer?: boolean;
};

export class DependenciesGetCmd implements Command {
  name = 'get <component-name>';
  arguments = [{ name: 'component-name', description: 'component name or component id' }];
  group = 'info';
  description = 'show direct and indirect dependencies of the given component';
  alias = '';
  options = [['t', 'tree', 'EXPERIMENTAL. render dependencies as a tree, similar to "npm ls"']] as CommandOptions;

  async report([id]: [string], { tree = false }: GetDependenciesFlags) {
    const results = (await dependencies(id, false)) as DependenciesResults;

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
      return `no dependencies found for ${results.id.toString()}.
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

export class DependenciesDebugCmd implements Command {
  name = 'debug <component-name>';
  arguments = [{ name: 'component-name', description: 'component name or component id' }];
  group = 'info';
  description = 'show the immediate dependencies and how their versions were determined';
  alias = '';
  options = [] as CommandOptions;

  async report([id]: [string]) {
    const results = (await dependencies(id, true)) as DependenciesResultsDebug;
    return JSON.stringify(results, undefined, 4);
  }
}

export class DependenciesSetCmd implements Command {
  name = 'set <component-pattern> <package...>';
  arguments = [
    { name: 'component-pattern', description: COMPONENT_PATTERN_HELP },
    { name: 'package', description: 'package name with version, e.g. "lodash@1.0.0"' },
  ];
  group = 'info';
  description = 'set a dependency to component(s)';
  alias = '';
  options = [
    ['d', 'dev', 'add to the devDependencies'],
    ['p', 'peer', 'add to the peerDependencies'],
  ] as CommandOptions;

  constructor(private deps: DependenciesMain) {}

  async report([pattern, packages]: [string, string[]], setDepsFlags: SetDependenciesFlags) {
    const results = await this.deps.setDependency(pattern, packages, setDepsFlags);
    return chalk.green(`the following component(s) have been successfully updated:\n${results.join('\n')}`);
  }
}

export class DependenciesCmd implements Command {
  name = 'dependencies <sub-command>';
  alias = 'deps';
  description = 'manage dependencies';
  options = [];
  group = 'info';
  commands: Command[] = [];

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "dependencies", please run "bit dependencies --help" to list the subcommands`
    );
  }
}
