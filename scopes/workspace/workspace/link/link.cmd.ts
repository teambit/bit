import { Command, CommandOptions } from '@teambit/cli';
import { LinkResults } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { BASE_DOCS_DOMAIN } from '@teambit/legacy/dist/constants';
import { timeFormat } from '@teambit/toolbox.time.time-format';
import chalk from 'chalk';
import { Workspace, WorkspaceLinkOptions } from '../workspace';
import { ComponentListLinks } from './component-list-links';
import { CoreAspectsLinks } from './core-aspects-links';
import { NestedComponentLinksLinks } from './nested-deps-in-nm-links';
import { RewireRow } from './rewire-row';

type LinkCommandOpts = {
  rewire: boolean;
  verbose: boolean;
};
export class LinkCommand implements Command {
  name = 'link [ids...]';
  alias = '';
  description = `generate symlinks to resolve module paths for imported components.\n  https://${BASE_DOCS_DOMAIN}/docs/dependencies#missing-links`;
  shortDescription = 'link components and core aspects';
  group = 'development';
  private = false;
  options = [
    ['j', 'json', 'return the output as JSON'],
    ['', 'verbose', 'verbose output'],
    ['r', 'rewire', 'EXPERIMENTAL. Replace relative paths with module paths in code (e.g. "../foo" => "@bit/foo")'],
  ] as CommandOptions;

  constructor(
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
    const listLinks = ComponentListLinks({ componentListLinks: linkResults.legacyLinkResults, verbose: opts.verbose });
    const rewireRow = RewireRow({ legacyCodemodResults: linkResults.legacyLinkCodemodResults });
    const nestedLinks = NestedComponentLinksLinks({
      nestedDepsInNmLinks: linkResults.nestedDepsInNmLinks,
      verbose: opts.verbose,
    });
    const footer = `Finished. ${timeDiff}`;
    return `${title}\n${coreLinks}\n${listLinks}\n${rewireRow}${nestedLinks}${footer}`;
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
    };
    const linkResults = await this.workspace.link(linkOpts);
    return linkResults;
  }
}
