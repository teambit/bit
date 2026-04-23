import type { Command, CommandOptions } from '@teambit/cli';
import { formatItem, formatSection, formatHint, warnSymbol, joinSections } from '@teambit/cli';
import open from 'open';
import { ejectTemplate } from '@teambit/eject';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import chalk from 'chalk';
import { isEmpty } from 'lodash';
import type { ComponentID } from '@teambit/component-id';
import type { ExportMain, ExportResult } from './export.main.runtime';

export class ExportCmd implements Command {
  name = 'export [component-patterns...]';
  description = 'upload components to remote scopes';
  arguments = [
    {
      name: 'component-patterns...',
      description: `(not recommended) ${COMPONENT_PATTERN_HELP}`,
    },
  ];
  extendedDescription = `uploads staged versions (snaps/tags) to remote scopes, making them available for consumption by other workspaces.
without arguments, exports all staged components. when on a lane, exports the lane as well.
exporting is the final step after development and versioning to share components with your team.`;
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
    ['', 'verbose', 'per exported component, show the versions being exported'],
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
      verbose = false,
    }: any
  ): Promise<string> {
    const {
      componentsIds,
      newIdsOnRemote,
      nonExistOnBitMap,
      removedIds,
      missingScope,
      exportedLanes,
      ejectResults,
      rippleJobUrls,
    } = await this.exportMain.export({
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

    const exportSection = (() => {
      if (isEmpty(componentsIds)) {
        if (!exportedLane) return '';
        return formatSection('exported lane', '', [formatItem(chalk.bold(exportedLane))]);
      }
      const lanesOutput = exportedLanes.length ? ` the lane ${chalk.bold(exportedLanes[0].id())} and` : '';
      // Split the exported ids into workspace components vs. updated dependents. The updated
      // dependents come from the lane's `updateDependents` list — hidden components that got
      // re-snapped (via a 'Snap updates' action or a local cascade) to keep the lane consistent.
      const laneUpdateIds = exportedLanes[0]?.updateDependents;
      const isUpdate = (id: ComponentID) => Boolean(laneUpdateIds?.find((u) => u.isEqualWithoutVersion(id)));
      const renderItem = (id: ComponentID) => {
        if (!verbose) return formatItem(chalk.bold(id.toString()));
        const versions = newIdsOnRemote
          .filter((newId) => newId.isEqualWithoutVersion(id))
          .map((newId) => newId.version);
        return formatItem(`${chalk.bold(id.toString())} - ${versions.join(', ') || 'n/a'}`);
      };
      const regularIds = componentsIds.filter((id) => !isUpdate(id));
      const updateIds = componentsIds.filter(isUpdate);
      const componentsPart = regularIds.length
        ? formatSection(
            'exported components',
            `exported${lanesOutput} the following component(s)`,
            regularIds.map(renderItem)
          )
        : '';
      const updatesPart = updateIds.length
        ? formatSection(
            'updated dependents',
            'hidden dependents re-snapped and pushed to keep the lane consistent',
            updateIds.map(renderItem)
          )
        : '';
      return [componentsPart, updatesPart].filter(Boolean).join('\n');
    })();

    const nonExistOnBitMapSection = (() => {
      if (isEmpty(nonExistOnBitMap)) return '';
      const idsStr = nonExistOnBitMap.map((id) => id.toString()).join(', ');
      return `${warnSymbol} ${chalk.yellow(idsStr)}\n${formatHint(
        "exported successfully. bit did not update the workspace as the component files are not tracked. this might happen when a component was tracked in a different git branch. to fix it check if they were tracked in a different git branch, checkout to that branch and resync by running 'bit import'. or stay on your branch and track the components again using 'bit add'."
      )}`;
    })();

    const removedSection = (() => {
      if (!removedIds.length) return '';
      const remoteLaneStr = exportedLanes.length ? ' lane' : '';
      const items = removedIds.map((id) => formatItem(id.toString(), warnSymbol));
      return formatSection(`components removed on the remote${remoteLaneStr}`, '', items);
    })();

    const missingScopeSection = (() => {
      if (isEmpty(missingScope)) return '';
      const items = missingScope.map((id) => formatItem(id.toString(), warnSymbol));
      const hint = formatHint(
        'please specify <remote> to export them, run \'bit scope set <scope> <component>\', or set a "defaultScope" in your workspace config'
      );
      return `${formatSection('components not exported (no remote scope configured)', '', items)}\n${hint}`;
    })();

    const ejectSection = (() => {
      if (!ejectResults) return '';
      return ejectTemplate(ejectResults);
    })();

    const rippleJobsSection = (() => {
      if (!rippleJobUrls.length) return '';
      const shouldOpenBrowser = openBrowser && !process.env.CI;
      const prefix = shouldOpenBrowser ? 'Your browser has been opened to the following link' : 'Visit the link below';
      const msg = `${prefix} to track the progress of building the components in the cloud`;
      if (shouldOpenBrowser) {
        open(rippleJobUrls[0]).catch(() => {
          /** it's ok, the user is instructed to open the browser manually */
        });
      }
      const urlsColored = rippleJobUrls.map((url) => chalk.bold.underline(url));
      return `${msg}\n${urlsColored.join('\n')}`;
    })();

    return joinSections([
      nonExistOnBitMapSection,
      missingScopeSection,
      exportSection,
      ejectSection,
      removedSection,
      rippleJobsSection,
    ]);
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
