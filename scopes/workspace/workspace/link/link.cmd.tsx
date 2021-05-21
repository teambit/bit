import { Command, CommandOptions } from '@teambit/cli';
import React from 'react';
import { LinkResults } from '@teambit/dependency-resolver';
import { Logger } from '@teambit/logger';
import { Text, Box } from 'ink';
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

  // async report() {
  //   const startTime = Date.now();
  //   const linkResults = await this.json();
  //   const endTime = Date.now();
  //   const executionTime = calculateTime(startTime, endTime);
  //   return JSON.stringify(linkResults, null, 2);
  // }

  async render([ids]: [string[]], opts: LinkCommandOpts) {
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
    return (
      <Box key="all" flexDirection="column">
        <Text>
          Linked {numOfComponents} components and {numOfCoreAspects} core aspects to node_modules for workspace:{' '}
          <Text color="cyan">{this.workspace.name}</Text>
        </Text>
        <CoreAspectsLinks coreAspectsLinks={coreAspectsLinksWithMainAspect} verbose={opts.verbose} />
        <ComponentListLinks componentListLinks={linkResults.legacyLinkResults} verbose={opts.verbose} />
        <RewireRow legacyCodemodResults={linkResults.legacyLinkCodemodResults} />
        <NestedComponentLinksLinks nestedDepsInNmLinks={linkResults.nestedDepsInNmLinks} verbose={opts.verbose} />
        <Text>Finished. {timeDiff}</Text>
      </Box>
    );
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
