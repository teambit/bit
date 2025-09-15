import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import { timeFormat } from '@teambit/toolbox.time.time-format';
import { compact } from 'lodash';
import chalk from 'chalk';
import type { Workspace } from '@teambit/workspace';
import type { InstallMain, WorkspaceLinkOptions, WorkspaceLinkResults } from '../install.main.runtime';
import { ComponentListLinks, packageListLinks } from './component-list-links';
import { CoreAspectsLinks } from './core-aspects-links';
import { NestedComponentLinksLinks } from './nested-deps-in-nm-links';
import { RewireRow } from './rewire-row';
import { linkToDir } from './link-to-dir';

type LinkCommandOpts = {
  rewire: boolean;
  verbose: boolean;
  target: string;
  skipFetchingObjects?: boolean;
  peers?: boolean;
  compSummary?: boolean;
};
export class LinkCommand implements Command {
  name = 'link [component-names...]';
  alias = '';
  description = 'create links between components and node_modules';
  extendedDescription = `creates links in node_modules for workspace components and core aspects, enabling import resolution.
automatically links all workspace components and Bit's core aspects to their respective package names.
useful for development when components need to reference each other or when debugging linking issues.`;
  helpUrl = 'reference/workspace/component-links';
  group = 'dependencies';
  private = false;
  arguments = [{ name: 'component-names...', description: 'names or IDs of the components to link' }];
  options = [
    ['j', 'json', 'return the output as JSON'],
    ['', 'verbose', 'verbose output'],
    ['r', 'rewire', 'Replace relative paths with module paths in code (e.g. "../foo" => "@bit/foo")'],
    [
      '',
      'target <dir>',
      'link to an external directory (similar to npm-link) so other projects could use these components',
    ],
    ['', 'skip-fetching-objects', 'skip fetch missing objects from remotes before linking'],
    ['', 'peers', 'link peer dependencies of the components too'],
    ['', 'comp-summary', 'show only a summary of component links instead of listing all components'],
  ] as CommandOptions;

  constructor(
    private install: InstallMain,
    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * logger extension.
     */
    private logger: Logger
  ) {}

  async report([ids]: [string[]], opts: LinkCommandOpts) {
    const startTime = Date.now();
    const linkResults = await this.json([ids], opts);
    const endTime = Date.now();
    const numOfComponents = linkResults.legacyLinkResults?.length;
    const timeDiff = timeFormat(endTime - startTime);
    const coreAspectsLinksWithMainAspect = linkResults.coreAspectsLinks || [];
    if (linkResults.teambitBitLink) {
      coreAspectsLinksWithMainAspect.unshift(linkResults.teambitBitLink);
    }
    const numOfCoreAspects = coreAspectsLinksWithMainAspect.length;

    const title = `Linked ${numOfComponents} components and ${numOfCoreAspects} core aspects to node_modules for workspace: ${this.workspace.name}`;
    const coreLinks = CoreAspectsLinks({
      coreAspectsLinks: coreAspectsLinksWithMainAspect,
      verbose: opts.verbose,
    });
    const nonCorePackagesLinks = packageListLinks(linkResults.slotOriginatedLinks);
    const compsLinks = ComponentListLinks({
      componentListLinks: linkResults.legacyLinkResults,
      verbose: opts.verbose,
      compSummary: opts.compSummary,
    });
    const rewireRow = RewireRow({ legacyCodemodResults: linkResults.legacyLinkCodemodResults });
    const nestedLinks = NestedComponentLinksLinks({
      nestedDepsInNmLinks: linkResults.nestedDepsInNmLinks,
      verbose: opts.verbose,
    });
    const targetLinks = linkToDir(linkResults.linkToDirResults);
    const footer = `Finished. ${timeDiff}`;
    return compact([
      title,
      coreLinks,
      nonCorePackagesLinks,
      compsLinks,
      rewireRow,
      nestedLinks,
      targetLinks,
      footer,
    ]).join('\n');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async json([ids]: [string[]], opts: LinkCommandOpts): Promise<WorkspaceLinkResults> {
    this.logger.console(
      `Linking components and core aspects to node_modules for workspaces: '${chalk.cyan(this.workspace.name)}'`
    );

    const linkOpts: WorkspaceLinkOptions = {
      linkToBitRoots: true,
      rewire: opts.rewire,
      linkCoreAspects: true,
      linkTeambitBit: true,
      linkToDir: opts.target,
      fetchObject: !opts.skipFetchingObjects,
      includePeers: opts.peers,
    };
    const linkResults = await this.install.link(linkOpts);
    return linkResults;
  }
}
