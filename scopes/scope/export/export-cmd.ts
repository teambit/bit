import { Command, CommandOptions } from '@teambit/cli';
import open from 'open';
import { ejectTemplate } from '@teambit/eject';
import { WILDCARD_HELP, COMPONENT_PATTERN_HELP, getCloudDomain } from '@teambit/legacy/dist/constants';
import chalk from 'chalk';
import { isEmpty } from 'lodash';
import { ExportMain, ExportResult } from './export.main.runtime';

export class ExportCmd implements Command {
  name = 'export [component-patterns...]';
  description = 'export components from the workspace to remote scopes';
  arguments = [
    {
      name: 'component-patterns...',
      description: `(not recommended) ${COMPONENT_PATTERN_HELP}`,
    },
  ];
  extendedDescription = `bit export => export all staged snaps/tags of components to their remote scope. if checked out to a lane, export the lane as well
  \`bit export [pattern...]\` => export components included by the pattern to their remote scope (we recommend not using a pattern in
    most scenarios so that all changes are exported simultaneously)
  ${WILDCARD_HELP('export')}`;
  alias = 'e';
  helpUrl = 'reference/components/exporting-components';
  options = [
    ['e', 'eject', 'after export, remove the components from the workspace and install them as packages'],
    [
      'a',
      'all',
      'export all components, including non-staged (useful when components in the remote scope are corrupted or missing)',
    ],
    [
      '',
      'all-versions',
      'export not only staged versions but all of them (useful when versions in the remote scope are corrupted or missing)',
    ],
    [
      '',
      'origin-directly',
      'avoid export to the central hub, instead, export directly to the original scopes. not recommended!',
    ],
    [
      '',
      'resume <string>',
      'in case the previous export failed and suggested to resume with an export-id, enter the id',
    ],
    [
      '',
      'head-only',
      'in case previous export failed and locally it shows exported and only one snap/tag was created, try using this flag',
    ],
    [
      '',
      'ignore-missing-artifacts',
      "don't throw an error when artifact files are missing. not recommended, unless you're sure the artifacts are in the remote",
    ],
    ['', 'fork-lane-new-scope', 'allow exporting a forked lane into a different scope than the original scope'],
    ['', 'open-browser', 'open a browser once the export is completed in the cloud job url'],
    ['j', 'json', 'show output in json format'],
  ] as CommandOptions;
  loader = true;
  group = 'collaborate';
  remoteOp = true;

  constructor(private exportMain: ExportMain) {}

  async report(
    [ids = []]: [string[]],
    {
      eject = false,
      all = false,
      allVersions = false,
      originDirectly = false,
      ignoreMissingArtifacts = false,
      resume,
      headOnly,
      forkLaneNewScope = false,
      openBrowser = false,
    }: any
  ): Promise<string> {
    const { componentsIds, nonExistOnBitMap, removedIds, missingScope, exportedLanes, ejectResults, rippleJobs } =
      await this.exportMain.export({
        ids,
        eject,
        includeNonStaged: all || allVersions,
        allVersions: allVersions || all,
        originDirectly,
        resumeExportId: resume,
        headOnly,
        ignoreMissingArtifacts,
        forkLaneNewScope,
      });
    if (isEmpty(componentsIds) && isEmpty(nonExistOnBitMap) && isEmpty(missingScope) && !exportedLanes.length) {
      return chalk.yellow('nothing to export');
    }
    const exportedLane = exportedLanes[0]?.id();
    const exportOutput = () => {
      if (isEmpty(componentsIds)) return exportedLane ? `exported the lane ${chalk.bold(exportedLane)}` : '';
      const lanesOutput = exportedLanes.length ? ` the lane ${chalk.bold(exportedLanes[0].id())} and` : '';
      return chalk.green(
        `exported${lanesOutput} the following ${componentsIds.length} component(s):\n${chalk.bold(
          componentsIds.join('\n')
        )}`
      );
    };
    const nonExistOnBitMapOutput = () => {
      // if includeDependencies is true, the nonExistOnBitMap might be the dependencies
      if (isEmpty(nonExistOnBitMap)) return '';
      const idsStr = nonExistOnBitMap.map((id) => id.toString()).join(', ');
      return chalk.yellow(
        `${idsStr}\nexported successfully. bit did not update the workspace as the component files are not tracked. this might happen when a component was tracked in a different git branch. to fix it check if they where tracked in a different git branch, checkout to that branch and resync by running 'bit import'. or stay on your branch and track the components again using 'bit add'.\n`
      );
    };
    const removedOutput = () => {
      if (!removedIds.length) return '';
      const remoteLaneStr = exportedLanes.length ? ' lane' : '';
      const title = chalk.bold(
        `\n\nthe following component(s) have been marked as removed on the remote${remoteLaneStr}\n`
      );
      const idsStr = removedIds.join('\n');
      return title + idsStr;
    };
    const missingScopeOutput = () => {
      if (isEmpty(missingScope)) return '';
      const idsStr = missingScope.map((id) => id.toString()).join(', ');
      return chalk.yellow(
        `the following component(s) were not exported as no remote scope is configured for them: ${chalk.bold(
          idsStr
        )}.\nplease specify <remote> to export them, run 'bit scope set <scope> <component>,  or set a "defaultScope" in your workspace config\n\n`
      );
    };
    const ejectOutput = () => {
      if (!ejectResults) return '';
      const output = ejectTemplate(ejectResults);
      return `\n${output}`;
    };
    const rippleJobsOutput = () => {
      if (!rippleJobs.length) return '';
      const shouldOpenBrowser = openBrowser && !process.env.CI;
      const prefix = shouldOpenBrowser ? 'Your browser has been opened to the following link' : 'Visit the link below';
      const msg = `\n\n${prefix} to track the progress of building the components in the cloud\n`;
      const lane = exportedLanes.length ? exportedLanes?.[0] : undefined;
      const fullUrls = lane
        ? rippleJobs.map(
            (job) =>
              `https://${getCloudDomain()}/${lane.scope.replace('.', '/')}/~lane/${lane.name}/~ripple-ci/job/${job}`
          )
        : rippleJobs.map((job) => `https://${getCloudDomain()}/ripple-ci/job/${job}`);
      if (shouldOpenBrowser) {
        open(fullUrls[0], { url: true }).catch(() => {
          /** it's ok, the user is instructed to open the browser manually */
        });
      }
      const urlsColored = fullUrls.map((url) => chalk.bold.underline(url));
      return msg + urlsColored.join('\n');
    };

    return (
      nonExistOnBitMapOutput() +
      missingScopeOutput() +
      exportOutput() +
      ejectOutput() +
      removedOutput() +
      rippleJobsOutput()
    );
  }

  async json(
    [ids = []]: [string[]],
    {
      eject = false,
      all = false,
      allVersions = false,
      originDirectly = false,
      ignoreMissingArtifacts = false,
      resume,
    }: any
  ): Promise<ExportResult> {
    const results = await this.exportMain.export({
      ids,
      eject,
      includeNonStaged: all || allVersions,
      allVersions: allVersions || all,
      originDirectly,
      resumeExportId: resume,
      ignoreMissingArtifacts,
    });

    return results;
  }
}
