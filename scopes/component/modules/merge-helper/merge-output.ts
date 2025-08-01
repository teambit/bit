import type { ComponentID } from '@teambit/component-id';
import type { ApplyVersionResult, WorkspaceConfigUpdateResult, WorkspaceDepsUpdates } from './types';
import chalk from 'chalk';
import { compact } from 'lodash';
import { FileStatus } from './merge-version';
import { FILE_CHANGES_CHECKOUT_MSG } from '@teambit/legacy.constants';

export function getWorkspaceConfigUpdateOutput(workspaceConfigUpdateResult?: WorkspaceConfigUpdateResult): string {
  if (!workspaceConfigUpdateResult) return '';
  const { workspaceConfigConflictWriteError, workspaceDepsConflicts, workspaceDepsUpdates, workspaceDepsUnchanged } =
    workspaceConfigUpdateResult;

  const getWorkspaceConflictsOutput = () => {
    if (!workspaceDepsConflicts && !workspaceConfigConflictWriteError) return '';
    if (workspaceConfigConflictWriteError) {
      return `${chalk.red(workspaceConfigConflictWriteError.message)}`;
    }
    return chalk.yellow('workspace.jsonc has conflicts, please edit the file and fix them');
  };

  const getWorkspaceUnchangedDepsOutput = () => {
    if (!workspaceDepsUnchanged) return '';
    const title = '\nworkspace.jsonc was unable to update the following dependencies';
    const body = Object.keys(workspaceDepsUnchanged)
      .map((pkgName) => {
        return `  ${pkgName}: ${workspaceDepsUnchanged[pkgName]}`;
      })
      .join('\n');

    return `${chalk.underline(title)}\n${body}`;
  };

  return compact([
    getWorkspaceUnchangedDepsOutput(),
    getWorkspaceDepsOutput(workspaceDepsUpdates),
    getWorkspaceConflictsOutput(),
  ]).join('\n\n');
}

function getWorkspaceDepsOutput(workspaceDepsUpdates?: WorkspaceDepsUpdates): string {
  if (!workspaceDepsUpdates) return '';

  const title = '\nworkspace.jsonc has been updated with the following dependencies';
  const body = Object.keys(workspaceDepsUpdates)
    .map((pkgName) => {
      const [from, to] = workspaceDepsUpdates[pkgName];
      return `  ${pkgName}: ${from} => ${to}`;
    })
    .join('\n');

  return `${chalk.underline(title)}\n${body}`;
}

/**
 * shows only the file-changes section.
 * if all files are "unchanged", it returns an empty string
 */
export function applyVersionReport(components: ApplyVersionResult[], addName = true, showVersion = false): string {
  const tab = addName ? '\t' : '';
  const fileChanges = compact(
    components.map((component: ApplyVersionResult) => {
      const name = showVersion ? component.id.toString() : component.id.toStringWithoutVersion();
      const files = compact(
        Object.keys(component.filesStatus).map((file) => {
          if (component.filesStatus[file] === FileStatus.unchanged) return null;
          const note =
            component.filesStatus[file] === FileStatus.manual
              ? chalk.white('automatic merge failed. please fix conflicts manually and then run "bit install"')
              : '';
          return `${tab}${String(component.filesStatus[file])} ${chalk.bold(file)} ${note}`;
        })
      ).join('\n');
      if (!files) return null;
      return `${addName ? name : ''}\n${chalk.cyan(files)}`;
    })
  ).join('\n\n');
  if (!fileChanges) {
    return '';
  }
  const title = `\n${FILE_CHANGES_CHECKOUT_MSG}\n`;
  return chalk.underline(title) + fileChanges;
}

export function conflictSummaryReport(components: ApplyVersionResult[]): {
  conflictedComponents: number;
  conflictedFiles: number;
  conflictStr: string;
} {
  const tab = '\t';
  let conflictedComponents = 0;
  let conflictedFiles = 0;
  const conflictStr = compact(
    components.map((component: ApplyVersionResult) => {
      const name = component.id.toStringWithoutVersion();
      const files = compact(
        Object.keys(component.filesStatus).map((file) => {
          if (component.filesStatus[file] === FileStatus.manual) {
            conflictedFiles += 1;
            return `${tab}${String(component.filesStatus[file])} ${chalk.bold(file)}`;
          }
          return null;
        })
      );
      if (!files.length) return null;
      conflictedComponents += 1;
      return `${name}\n${chalk.cyan(files.join('\n'))}`;
    })
  ).join('\n');

  return { conflictedComponents, conflictedFiles, conflictStr };
}

export function installationErrorOutput(installationError?: Error) {
  if (!installationError) return '';
  const title = chalk.underline('Installation Error');
  const subTitle = 'The following error was thrown by the package manager:';
  const body = chalk.red(installationError.message);
  const suggestion =
    'Use "bit install" to complete the installation, remove the imported components using "bit remove <comp id>" or remove the missing dependencies from their source code';
  return `${title}\n${subTitle}\n${body}\n${suggestion}`;
}

export function compilationErrorOutput(compilationError?: Error) {
  if (!compilationError) return '';
  const title = chalk.underline('Compilation Error');
  const subTitle = 'The following error was thrown by the compiler';
  const body = chalk.red(compilationError.message);
  const suggestion = 'Please fix the issue and run "bit compile"';
  return `${title}\n${subTitle}\n${body}\n${suggestion}`;
}

export function getRemovedOutput(removedComponents?: ComponentID[]) {
  if (!removedComponents?.length) return '';
  const title = `the following ${removedComponents.length} component(s) have been removed`;
  const body = removedComponents.join('\n');
  return `${chalk.underline(title)}\n${body}`;
}

export function getAddedOutput(addedComponents?: ComponentID[]) {
  if (!addedComponents?.length) return '';
  const title = `the following ${addedComponents.length} component(s) have been added`;
  const body = addedComponents.join('\n');
  return `${chalk.underline(title)}\n${body}`;
}
