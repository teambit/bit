// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import Table from 'cli-table';
import chalk from 'chalk';
import archy from 'archy';
import { ComponentIdGraph } from '@teambit/graph';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { generateDependenciesInfoTable } from './template';
import { DependenciesMain } from './dependencies.main.runtime';

type GetDependenciesFlags = {
  tree: boolean;
  scope?: boolean;
};

export type SetDependenciesFlags = {
  dev?: boolean;
  optional?: boolean;
  peer?: boolean;
};

export type RemoveDependenciesFlags = SetDependenciesFlags;

export class DependenciesGetCmd implements Command {
  name = 'get <component-name>';
  arguments = [{ name: 'component-name', description: 'component name or component id' }];
  group = 'info';
  description = 'show direct and indirect dependencies of the given component';
  alias = '';
  options = [
    ['', 'scope', 'get the data from the scope instead of the workspace'],
    ['t', 'tree', 'EXPERIMENTAL. render dependencies as a tree, similar to "npm ls"'],
  ] as CommandOptions;

  constructor(private deps: DependenciesMain) {}

  async report([id]: [string], { tree = false, scope = false }: GetDependenciesFlags) {
    const results = await this.deps.getDependencies(id, scope);

    if (tree) {
      const idWithVersion = results.id;
      const getGraphAsTree = (graph: ComponentIdGraph) => {
        try {
          const graphAsTree = graph.getDependenciesAsObjectTree(idWithVersion.toString());
          return archy(graphAsTree);
        } catch (err: any) {
          if (err.constructor.name === 'RangeError') {
            return `${chalk.red(
              'unable to generate a tree representation, the graph is too big or has cyclic dependencies'
            )}`;
          }
          throw err;
        }
      };
      const graphTree = getGraphAsTree(results.graph);
      return graphTree;
    }
    const depsInfo = results.graph.getDependenciesInfo(results.id);
    if (!depsInfo.length) {
      return `no dependencies found for ${results.id.toString()}.
try running "bit cat-component ${results.id.toStringWithoutVersion()}" to see whether the component/version exists locally`;
    }

    const depsTable = generateDependenciesInfoTable(depsInfo, results.id);
    return `${depsTable || '<none>'}`;
  }
}

export class DependenciesDebugCmd implements Command {
  name = 'debug <component-name>';
  arguments = [{ name: 'component-name', description: 'component name or component id' }];
  group = 'info';
  description = 'show the immediate dependencies and how their versions were determined';
  alias = '';
  options = [] as CommandOptions;

  constructor(private deps: DependenciesMain) {}

  async report([id]: [string]) {
    const results = await this.deps.debugDependencies(id);
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
    ['o', 'optional', 'add to the optionalDependencies'],
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

export class DependenciesUnsetCmd implements Command {
  name = 'unset <component-pattern> <package...>';
  arguments = [
    { name: 'component-pattern', description: COMPONENT_PATTERN_HELP },
    {
      name: 'package...',
      description:
        'package name with or without a version, e.g. "lodash@1.0.0" or just "lodash" which will remove all lodash instances of any version',
    },
  ];
  group = 'info';
  description = 'unset a dependency to component(s) that was previously set by "bit deps set"';
  alias = '';
  options = [
    ['d', 'dev', 'unset from devDependencies'],
    ['p', 'peer', 'unset from peerDependencies'],
  ] as CommandOptions;

  constructor(private deps: DependenciesMain) {}

  async report([pattern, packages]: [string, string[]], removeDepsFlags: RemoveDependenciesFlags) {
    const results = await this.deps.removeDependency(pattern, packages, removeDepsFlags, true);
    if (!results.length) {
      return chalk.yellow('the specified component-pattern do not use the entered packages. nothing to unset');
    }

    const output = results
      .map(({ id, removedPackages }) => `${chalk.underline(id.toString())}\n${removedPackages.join('\n')}`)
      .join('\n\n');

    return `${chalk.green('successfully unset dependencies')}\n${output}`;
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

type DependenciesUsageCmdOptions = {
  depth?: number;
};

export class DependenciesUsageCmd implements Command {
  name = 'usage <dependency-name>';
  arguments = [
    {
      name: 'dependency-name',
      description:
        'package-name. for components, you can use either component-id or package-name. if version is specified, it will search for the exact version',
    },
  ];
  group = 'info';
  description = 'EXPERIMENTAL. find components that use the specified dependency';
  alias = '';
  options = [['', 'depth <number>', 'max display depth of the dependency graph']] as CommandOptions;

  constructor(private deps: DependenciesMain) {}

  async report([depName]: [string], options: DependenciesUsageCmdOptions) {
    const deepUsageResult = await this.deps.usageDeep(depName, options);
    if (deepUsageResult != null) return deepUsageResult;
    const results = await this.deps.usage(depName);
    if (!Object.keys(results).length) {
      return chalk.yellow(`the specified dependency ${depName} is not used by any component`);
    }
    return Object.keys(results)
      .map((compIdStr) => `${chalk.bold(compIdStr)} (using dep in version ${results[compIdStr]})`)
      .join('\n');
  }
}

export class WhyCmd extends DependenciesUsageCmd {
  name = 'why <dependency-name>';
}

export class DependenciesCmd implements Command {
  name = 'deps <sub-command>';
  alias = 'dependencies';
  description = 'manage dependencies';
  options = [];
  group = 'info';
  commands: Command[] = [];
  helpUrl = 'reference/dependencies/configuring-dependencies';

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "dependencies", please run "bit dependencies --help" to list the subcommands`
    );
  }
}

export class SetPeerCmd implements Command {
  name = 'set-peer <component-id> <range>';
  arguments = [
    { name: 'component-id', description: 'the component to set as always peer' },
    {
      name: 'range',
      description: 'the default range to use for the componnent, when added to peerDependencies',
    },
  ];
  group = 'info';
  description = 'set a component as always peer';
  alias = '';
  options = [];

  constructor(private deps: DependenciesMain) {}

  async report([componentId, range]: [string, string]) {
    await this.deps.setPeer(componentId, range != null ? range.toString() : range);
    return `${chalk.green('successfully marked the component as a peer component')}`;
  }
}

export class UnsetPeerCmd implements Command {
  name = 'unset-peer <component-id>';
  arguments = [{ name: 'component-id', description: 'the component to unset as always peer' }];
  group = 'info';
  description = 'unset a component as always peer';
  alias = '';
  options = [];

  constructor(private deps: DependenciesMain) {}

  async report([componentId]: [string]) {
    await this.deps.unsetPeer(componentId);
    return `${chalk.green('successfully marked the component as not a peer component')}`;
  }
}
