import { Command, CommandOptions } from '@teambit/cli';
import { LinkResults } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { timeFormat } from '@teambit/toolbox.time.time-format';
import chalk from 'chalk';
import { Workspace, WorkspaceLinkOptions } from '../workspace';
import { ComponentListLinks } from './component-list-links';
import { CoreAspectsLinks } from './core-aspects-links';
import { NestedComponentLinksLinks } from './nested-deps-in-nm-links';
import { RewireRow } from './rewire-row';
import { linkToDir } from './link-to-dir';

type LinkCommandOpts = {
  rewire: boolean;
  verbose: boolean;
  target: string;
  skipFetchingObjects?: boolean;
};
export class LinkCommand implements Command {
  name = 'link [ids...]';
  alias = '';
  description = 'link components and core aspects';
  extendedDescription: string;
  group = 'development';
  private = false;
  options = [
    ['j', 'json', 'return the output as JSON'],
    ['', 'verbose', 'verbose output'],
    ['r', 'rewire', 'Replace relative paths with module paths in code (e.g. "../foo" => "@bit/foo")'],
    [
      '',
      'target <dir>',
      'EXPERIMENTAL. link to an external directory (similar to npm-link) so other projects could use these components',
    ],
    ['', 'skip-fetching-objects', 'skip fetch missing objects from remotes before linking'],
  ] as CommandOptions;

  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * logger extension.
     */
    private logger: Logger,

    private docsDomain: string
  ) {
    this.extendedDescription = `https://${this.docsDomain}/workspace/component-links`;
  }

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
    const compsLinks = ComponentListLinks({ componentListLinks: linkResults.legacyLinkResults, verbose: opts.verbose });
    const rewireRow = RewireRow({ legacyCodemodResults: linkResults.legacyLinkCodemodResults });
    const nestedLinks = NestedComponentLinksLinks({
      nestedDepsInNmLinks: linkResults.nestedDepsInNmLinks,
      verbose: opts.verbose,
    });
    const targetLinks = linkToDir(linkResults.linkToDirResults);
    const footer = `Finished. ${timeDiff}`;
    return `${title}\n${coreLinks}\n${compsLinks}\n${rewireRow}${nestedLinks}${targetLinks}${footer}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async json([ids]: [string[]], opts: LinkCommandOpts): Promise<LinkResults> {
    this.logger.console(
      `Linking components and core aspects to node_modules for workspaces: '${chalk.cyan(this.workspace.name)}'`
    );

    const linkOpts: WorkspaceLinkOptions = {
      legacyLink: true,
      rewire: opts.rewire,
      linkCoreAspects: true,
      linkTeambitBit: true,
      linkToDir: opts.target,
      fetchObject: !opts.skipFetchingObjects,
    };
    const linkResults = await this.workspace.link(linkOpts);
    return linkResults;
  }
}
