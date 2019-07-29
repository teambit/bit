/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { status } from '../../../api/consumer';
import type { StatusResult } from '../../../api/consumer/lib/status';
import Component from '../../../consumer/component';
import { immutableUnshift, isString } from '../../../utils';
import { formatBitString, formatNewBit } from '../../chalk-box';
import {
  componentIssuesLabels,
  getInvalidComponentLabel,
  componentIssueToString
} from '../../templates/component-issues-template';
import { Analytics } from '../../../analytics/analytics';
import { BASE_DOCS_DOMAIN } from '../../../constants';

const TROUBLESHOOTING_MESSAGE = `${chalk.yellow(
  `see troubleshooting at https://${BASE_DOCS_DOMAIN}/docs/troubleshooting-isolating.html`
)}`;

export const statusFailureMsg = 'issues found';
export const statusInvalidComponentsMsg = 'invalid components';
export const statusWorkspaceIsCleanMsg =
  'nothing to tag or export (use "bit add <file...>" to track files or directories as components)';
export const importPendingMsg =
  'your workspace has outdated objects. please use "bit import" to pull the latest objects from the remote scope';

export default class Status extends Command {
  name = 'status';
  description = `show the working area component(s) status.\n  https://${BASE_DOCS_DOMAIN}/docs/cli-status.html`;
  alias = 's';
  opts = [['j', 'json', 'return a json version of the component']];
  loader = true;
  migration = true;
  json = false;

  action([], { json }: { json?: boolean }): Promise<Object> {
    this.json = json;
    return status();
  }

  report({
    newComponents,
    modifiedComponent,
    stagedComponents,
    componentsWithMissingDeps,
    importPendingComponents,
    autoTagPendingComponents,
    invalidComponents,
    outdatedComponents
  }: StatusResult): string {
    if (this.json) {
      return JSON.stringify(
        {
          newComponents,
          modifiedComponent: modifiedComponent.map(c => c.id.toString()),
          stagedComponents: stagedComponents.map(c => c.id()),
          componentsWithMissingDeps: componentsWithMissingDeps.map(c => c.id.toString()),
          importPendingComponents: importPendingComponents.map(c => c.id.toString()),
          autoTagPendingComponents,
          invalidComponents,
          outdatedComponents: outdatedComponents.map(c => c.id.toString())
        },
        null,
        2
      );
    }
    // If there is problem with at least one component we want to show a link to the
    // troubleshooting doc
    let showTroubleshootingLink = false;

    function formatMissing(missingComponent: Component) {
      function formatMissingStr(key, value, label) {
        if (!value || R.isEmpty(value)) return '';
        return (
          chalk.yellow(`\n       ${label}: \n`) +
          chalk.white(
            Object.keys(value)
              .map(key => `          ${key} -> ${componentIssueToString(value[key])}`)
              .join('\n')
          )
        );
      }

      const missingStr = Object.keys(componentIssuesLabels)
        .map((key) => {
          if (missingComponent.issues[key]) Analytics.incExtraDataKey(key);
          return formatMissingStr(key, missingComponent.issues[key], componentIssuesLabels[key]);
        })
        .join('');
      return `       ${missingStr}\n`;
    }

    function format(component: string | Component, showVersions: boolean = false, message?: string): string {
      const missing = componentsWithMissingDeps.find((missingComp: Component) => {
        const compId = component.id ? component.id.toString() : component;
        return missingComp.id.toString() === compId;
      });
      const messageStatus = message ? chalk.yellow(message) : chalk.green('ok');

      if (isString(component)) return `${formatBitString(component)} ... ${messageStatus}`;
      let bitFormatted = `${formatNewBit(component)}`;
      if (showVersions) {
        const localVersions = component.getLocalVersions();
        bitFormatted += `. versions: ${localVersions.join(', ')}`;
      }
      bitFormatted += ' ... ';
      if (!missing) return `${bitFormatted}${messageStatus}`;
      showTroubleshootingLink = true;
      return `${bitFormatted} ${chalk.red(statusFailureMsg)}${formatMissing(missing)}`;
    }

    const importPendingWarning = importPendingComponents.length ? chalk.yellow(`${importPendingMsg}.\n`) : '';

    const splitByMissing = R.groupBy((component) => {
      return component.includes(statusFailureMsg) ? 'missing' : 'nonMissing';
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

    const invalidDesc = '\nthese components were failed to load.\n';
    const invalidComponentOutput = immutableUnshift(
      invalidComponents.map(c => format(c.id.toString(), true, getInvalidComponentLabel(c.error))).sort(),
      invalidComponents.length ? chalk.underline.white(statusInvalidComponentsMsg) + invalidDesc : ''
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
          invalidComponentOutput
        ]
          .filter(x => x)
          .join(chalk.underline('\n                         \n') + chalk.white('\n')) +
        troubleshootingStr || chalk.yellow(statusWorkspaceIsCleanMsg)
    );
  }
}
