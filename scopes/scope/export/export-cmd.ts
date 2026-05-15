import type { Command, CommandOptions } from '@teambit/cli';
import { formatItem, formatSection, formatHint, warnSymbol, joinSections } from '@teambit/cli';
import open from 'open';
import { ejectTemplate } from '@teambit/eject';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import chalk from 'chalk';
import { isEmpty } from 'lodash';
import type { ComponentID } from '@teambit/component-id';
import type { ExportMain, ExportResult } from './export.main.runtime';
import { exportCommand } from './export.commands';

export class ExportCmd implements Command {
  name = exportCommand.name;
  description = exportCommand.description;
  arguments = exportCommand.arguments;
  extendedDescription = exportCommand.extendedDescription;
  alias = exportCommand.alias;
  helpUrl = exportCommand.helpUrl;
  options = exportCommand.options;
  loader = exportCommand.loader;
  group = exportCommand.group;
  remoteOp = exportCommand.remoteOp;

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
      // Split exported ids into "regular lane components" vs "updates" — match the UI's
      // terminology (the 'Snap updates' button surfaces lane.updateDependents as updates rather
      // than top-level components). Hidden cascade snaps land in the 'exported updates' section
      // so users aren't told they exported components they don't have in the workspace.
      // Precompute a Set keyed by `toStringWithoutVersion()` so the per-id classification is
      // O(1) instead of an O(N·M) linear scan over `laneUpdateIds`.
      const laneUpdateKeys = new Set((exportedLanes[0]?.updateDependents || []).map((u) => u.toStringWithoutVersion()));
      const isUpdate = (id: ComponentID) => laneUpdateKeys.has(id.toStringWithoutVersion());
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
            'exported updates',
            "impacted dependents pushed to keep the lane consistent (from a 'Snap updates' / local cascade)",
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
