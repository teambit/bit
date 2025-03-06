import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import { VisualDependencyGraph, GraphConfig } from '@teambit/legacy.dependency-graph';
import chalk from 'chalk';
import { VersionHistoryMain } from './version-history.main.runtime';
import { catVersionHistory } from './cat-version-history';

export class VersionHistoryCmd implements Command {
  name = 'version-history <sub-command>';
  alias = 'vh';
  description = 'manage the version-history of components';
  options = [];
  group = 'info';
  commands: Command[] = [];

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "version-history", please run "bit version-history --help" to list the subcommands`
    );
  }
}

export type BuildOptions = {
  fromSnap?: string;
  deleteExisting?: boolean;
  remote?: string;
  pattern?: string;
  fromAllLanes?: boolean;
};

export class VersionHistoryBuildCmd implements Command {
  name = 'build <component-pattern>';
  description = 'rebuild the version history of a component. helpful when it got corrupted for some reason';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  options = [
    [
      '',
      'from-snap <snap>',
      'build the version history from a specific snap. the pattern must be a single component-id',
    ],
    ['', 'from-all-lanes', 'build the version history from the heads of all lanes that include this component'],
    ['', 'delete-existing', 'delete the existing version history before building it'],
    ['', 'remote <scope>', 'make the change on the remote scope'],
  ] as CommandOptions;
  group = 'info';

  constructor(private versionHistoryMain: VersionHistoryMain) {}

  async report([pattern]: [string], opts: BuildOptions) {
    const results = await this.versionHistoryMain.buildByPattern(pattern, opts);
    const resultsStr = Object.keys(results)
      .map((idStr) => {
        const result = results[idStr];
        const getMsg = () => {
          if (result.err) return `failed with an error: ${chalk.red(result.err.message)}`;
          if (!result.added) return 'no changes';
          return `successfully added ${result.added.length} hashes`;
        };
        const msg = getMsg();
        return `${chalk.bold(idStr)}: ${msg}`;
      })
      .join('\n');

    return `${chalk.green('completed building version history for the following component(s)')}:\n${resultsStr}`;
  }
}

const colorPerEdgeType = {
  unrelated: 'red',
  squashed: 'blue',
};

export class VersionHistoryGraphCmd implements Command {
  name = 'graph <component-id>';
  alias = '';
  description = 'generate a graph of the version history of a component and save as an SVG file';
  options = [
    ['s', 'short-hash', 'show only 9 chars of the hash'],
    ['m', 'mark <string>', 'paint the given node-ids in the graph in red color, for multiple, separate by commas'],
    ['', 'png', 'save the graph as a png file instead of svg. requires "graphviz" to be installed'],
    [
      'l',
      'layout <name>',
      'GraphVis layout. default to "dot". options are [circo, dot, fdp, neato, osage, patchwork, sfdp, twopi]',
    ],
  ] as CommandOptions;
  group = 'info';
  commands: Command[] = [];

  constructor(private versionHistoryMain: VersionHistoryMain) {}

  async report(
    [id]: [string],
    {
      shortHash,
      mark,
      png,
      layout,
    }: {
      shortHash?: boolean;
      mark?: string;
      png?: boolean;
      layout?: string;
    }
  ) {
    const graphHistory = await this.versionHistoryMain.generateGraph(id, shortHash);
    const markIds = mark ? mark.split(',').map((node) => node.trim()) : undefined;
    const config: GraphConfig = { colorPerEdgeType };
    if (layout) config.layout = layout;
    const visualDependencyGraph = await VisualDependencyGraph.loadFromClearGraph(graphHistory, config, markIds);

    return visualDependencyGraph.render(png ? 'png' : 'svg');
  }
}

export type ShowOptions = { shortHash?: boolean };

export class VersionHistoryShowCmd implements Command {
  name = 'show <component-id>';
  alias = 'vh';
  description = 'show the version-history of a component';
  options = [
    ['s', 'short-hash', 'show only 9 chars of the hash'],
    ['j', 'json', 'json format'],
  ] as CommandOptions;
  group = 'info';
  commands: Command[] = [];

  constructor(private versionHistoryMain: VersionHistoryMain) {}

  async report([id]: [string], { shortHash }: ShowOptions) {
    const versionHistory = await this.versionHistoryMain.show(id, { shortHash });
    const output = versionHistory
      .map((item) => {
        const pointers = item.pointers.length ? ` (${chalk.cyan(item.pointers.join(', '))})` : '';
        const edges = item.edges.map((edge) => `${edge.hash} (${edge.type})`).join(', ');
        return `${chalk.bold(item.node)}${pointers} ${edges}`;
      })
      .join('\n');
    return output;
  }

  async json([id]: [string]) {
    return catVersionHistory(id);
  }
}
