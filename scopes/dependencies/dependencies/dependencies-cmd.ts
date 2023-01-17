// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import Table from 'cli-table';
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

export type RemoveDependenciesFlags = SetDependenciesFlags;

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
    {
      name: 'package...',
      description:
        'package name with or without a version, e.g. "lodash@1.0.0" or just "lodash" which will be resolved to the latest',
    },
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
    const { changedComps, addedPackages } = await this.deps.setDependency(pattern, packages, setDepsFlags);

    return `${chalk.green('successfully updated dependencies')}
${chalk.bold('changed components')}
${changedComps.join('\n')}

${chalk.bold('added packages')}
${JSON.stringify(addedPackages, undefined, 4)}`;
  }
}

export class DependenciesRemoveCmd implements Command {
  name = 'remove <component-pattern> <package...>';
  arguments = [
    { name: 'component-pattern', description: COMPONENT_PATTERN_HELP },
    {
      name: 'package...',
      description:
        'package name with or without a version, e.g. "lodash@1.0.0" or just "lodash" which will remove all lodash instances of any version',
    },
  ];
  group = 'info';
  description = 'remove a dependency to component(s)';
  alias = '';
  options = [
    ['d', 'dev', 'remove from devDependencies'],
    ['p', 'peer', 'remove from peerDependencies'],
  ] as CommandOptions;

  constructor(private deps: DependenciesMain) {}

  async report([pattern, packages]: [string, string[]], removeDepsFlags: RemoveDependenciesFlags) {
    const results = await this.deps.removeDependency(pattern, packages, removeDepsFlags);
    if (!results.length) {
      return chalk.yellow('the specified component-pattern do not use the entered packages. nothing to remove');
    }

    const output = results
      .map(({ id, removedPackages }) => `${chalk.underline(id.toString())}\n${removedPackages.join('\n')}`)
      .join('\n\n');

    return `${chalk.green('successfully removed dependencies')}\n${output}`;
  }
}

export class DependenciesResetCmd implements Command {
  name = 'reset <component-pattern>';
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  group = 'info';
  description = 'reset dependencies to the default values (revert any previously "bit deps set")';
  alias = '';
  options = [] as CommandOptions;

  constructor(private deps: DependenciesMain) {}

  async report([pattern]: [string]) {
    const results = await this.deps.reset(pattern);
    const comps = results.map((id) => id.toString());

    return `${chalk.green('successfully reset dependencies for the following component(s)')}\n${comps}`;
  }
}

export class DependenciesEjectCmd implements Command {
  name = 'eject <component-pattern>';
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  group = 'info';
  description = 'write dependencies that were previously set via "bit deps set" into .bitmap';
  alias = '';
  options = [] as CommandOptions;

  constructor(private deps: DependenciesMain) {}

  async report([pattern]: [string]) {
    const results = await this.deps.eject(pattern);
    const comps = results.map((id) => id.toString());

    return `${chalk.green('successfully ejected dependencies for the following component(s)')}\n${comps}`;
  }
}

export class DependenciesBlameCmd implements Command {
  name = 'blame <component-name> <dependency-name>';
  arguments = [
    {
      name: 'dependency-name',
      description: 'package-name. for components, you can use either component-id or package-name',
    },
  ];
  group = 'info';
  description = 'EXPERIMENTAL. find out which snap/tag changed a dependency version';
  alias = '';
  options = [] as CommandOptions;

  constructor(private deps: DependenciesMain) {}

  async report([compName, depName]: [string, string]) {
    const results = await this.deps.blame(compName, depName);
    if (!results.length) {
      return chalk.yellow(`the specified component ${compName} does not use the entered dependency ${depName}`);
    }
    // table with no style and no borders, just to align the columns.
    const table = new Table({
      chars: {
        top: '',
        'top-mid': '',
        'top-left': '',
        'top-right': '',
        bottom: '',
        'bottom-mid': '',
        'bottom-left': '',
        'bottom-right': '',
        left: '',
        'left-mid': '',
        mid: '',
        'mid-mid': '',
        right: '',
        'right-mid': '',
        middle: ' ',
      },
      style: { 'padding-left': 0, 'padding-right': 0 },
    });

    results.map(({ snap, tag, author, date, message, version }) =>
      table.push([snap, tag || '', author, date, message, version])
    );

    return table.toString();
  }
}

export class DependenciesCmd implements Command {
  name = 'deps <sub-command>';
  alias = 'dependencies';
  description = 'manage dependencies';
  options = [];
  group = 'info';
  commands: Command[] = [];
  helpUrl = 'docs/dependencies/configuring-dependencies';

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "dependencies", please run "bit dependencies --help" to list the subcommands`
    );
  }
}
