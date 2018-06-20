/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { status } from '../../../api/consumer';
import type { StatusResult } from '../../../api/consumer/lib/status';
import Component from '../../../consumer/component';
import { immutableUnshift, isString } from '../../../utils';
import { formatBitString, formatNewBit } from '../../chalk-box';
import { missingDependenciesLabels } from '../../templates/missing-dependencies-template';
import { Analytics } from '../../../analytics/analytics';
import { BASE_DOCS_DOMAIN } from '../../../constants';

const TROUBLESHOOTING_MESSAGE = `${chalk.yellow(
  `see troubleshooting at https://${BASE_DOCS_DOMAIN}/docs/troubleshooting-isolating.html`
)}`;
export default class Status extends Command {
  name = 'status';
  description = `show the working area component(s) status.\n  https://${BASE_DOCS_DOMAIN}/docs/cli-status.html`;
  alias = 's';
  opts = [];
  loader = true;
  migration = true;

  action(): Promise<Object> {
    return status();
  }

  report({
    newComponents,
    modifiedComponent,
    stagedComponents,
    componentsWithMissingDeps,
    importPendingComponents,
    autoTagPendingComponents,
    deletedComponents,
    outdatedComponents
  }: StatusResult): string {
    // If there is problem with at least one component we want to show a link to the
    // troubleshooting doc
    let showTroubleshootingLink = false;

    function formatMissing(missingComponent: Component) {
      function formatMissingStr(key, array, label) {
        if (!array || R.isEmpty(array)) return '';
        return (
          chalk.yellow(`\n       ${label}: \n`) +
          chalk.white(
            Object.keys(array)
              .map(key => `          ${key} -> ${array[key].join(', ')}`)
              .join('\n')
          )
        );
      }

      const missingStr = Object.keys(missingDependenciesLabels)
        .map((key) => {
          if (missingComponent.missingDependencies[key]) Analytics.incExtraDataKey(key);
          return formatMissingStr(key, missingComponent.missingDependencies[key], missingDependenciesLabels[key]);
        })
        .join('');
      return `       ${missingStr}\n`;
    }

    function format(component: string | Component, showVersions: boolean = false): string {
      const missing = componentsWithMissingDeps.find((missingComp: Component) => {
        const compId = component.id ? component.id.toString() : component;
        return missingComp.id.toString() === compId;
      });

      if (isString(component)) return `${formatBitString(component)} ... ${chalk.green('ok')}`;
      let bitFormatted = `${formatNewBit(component)}`;
      if (showVersions) {
        const localVersions = component.getLocalVersions();
        bitFormatted += `. versions: ${localVersions.join(', ')}`;
      }
      bitFormatted += ' ... ';
      if (!missing) return `${bitFormatted}${chalk.green('ok')}`;
      showTroubleshootingLink = true;
      return `${bitFormatted} ${chalk.red('missing dependencies')}${formatMissing(missing)}`;
    }

    const importPendingWarning = importPendingComponents.length
      ? chalk.yellow(
        'your workspace has outdated objects. please use "bit import" to pull the latest objects from the remote scope.\n'
      )
      : '';

    const splitByMissing = R.groupBy((component) => {
      return component.includes('missing dependencies') ? 'missing' : 'nonMissing';
    });
    const { missing, nonMissing } = splitByMissing(newComponents.map(c => format(c)));

    const outdatedTitle = chalk.underline.white('pending updates');
    const outdatedDesc =
      '(use "bit checkout [version] [component_id]" to merge changes)\n(use "bit diff [component_id] [new_version]" to compare changes)\n(use "bit log [component_id]" to list all available versions)\n';
    const outdatedComps = outdatedComponents
      .map((component) => {
        return `    > ${chalk.cyan(component.id.toStringWithoutVersion())} current: ${component.id.version} latest: ${
          component.latestVersion
        }\n`;
      })
      .join('');

    const outdatedStr = outdatedComponents.length ? [outdatedTitle, outdatedDesc, outdatedComps].join('\n') : '';

    const newComponentDescription = '\n(use "bit tag --all [version]" to lock a version with all your changes)\n';
    const newComponentsTitle = newComponents.length
      ? chalk.underline.white('new components') + newComponentDescription
      : '';

    const newComponentsOutput = [newComponentsTitle, ...(nonMissing || []), ...(missing || [])].join('\n');

    const modifiedDesc = '(use "bit diff" to compare changes)\n';
    const modifiedComponentOutput = immutableUnshift(
      modifiedComponent.map(c => format(c)),
      modifiedComponent.length
        ? chalk.underline.white('modified components') + newComponentDescription + modifiedDesc
        : ''
    ).join('\n');

    const autoTagPendingOutput = immutableUnshift(
      autoTagPendingComponents.map(c => format(c)),
      autoTagPendingComponents.length
        ? chalk.underline.white('components pending to be tagged automatically (when their dependencies are tagged)')
        : ''
    ).join('\n');

    const deletedDesc =
      '\nthese components were deleted from your project.\nuse "bit remove [component_id]" to remove these component from your workspace\n';
    const deletedComponentOutput = immutableUnshift(
      deletedComponents.map(c => format(c)),
      deletedComponents.length ? chalk.underline.white('deleted components') + deletedDesc : ''
    ).join('\n');

    const stagedDesc = '\n(use "bit export <remote_scope> to push these components to a remote scope")\n';
    const stagedComponentsOutput = immutableUnshift(
      stagedComponents.map(c => format(c, true)),
      stagedComponents.length ? chalk.underline.white('staged components') + stagedDesc : ''
    ).join('\n');

    const troubleshootingStr = showTroubleshootingLink ? `\n${TROUBLESHOOTING_MESSAGE}` : '';

    return (
      importPendingWarning +
        [
          outdatedStr,
          newComponentsOutput,
          modifiedComponentOutput,
          stagedComponentsOutput,
          autoTagPendingOutput,
          deletedComponentOutput
        ]
          .filter(x => x)
          .join(chalk.underline('\n                         \n') + chalk.white('\n')) +
        troubleshootingStr ||
      chalk.yellow('nothing to tag or export (use "bit add <file...>" to track files or directories as components)')
    );
  }
}
