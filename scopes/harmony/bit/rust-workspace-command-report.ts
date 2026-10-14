import { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { ApplyVersionResults } from '@teambit/component.modules.merge-helper';
import { FileStatus } from '@teambit/component.modules.merge-helper/dist/merge-version.js';
import { checkoutOutput } from '@teambit/checkout/dist/checkout-output.js';
import { mergeReport } from '@teambit/merging/dist/merge-report.js';
import { IssuesList } from '@teambit/component-issues';
import { ComponentsHaveIssues } from '@teambit/builder/dist/exceptions/components-have-issues.js';
import { joinSections } from '@teambit/cli/dist/output-formatter.js';
import type { RustWorkspaceCommandOptions } from './rust-workspace-command-options';

function record(value: any, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error('native command report shape');
  return value;
}

function rows(value: any): any[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4096) throw new Error('native command report rows');
  return value;
}

function id(value: any): ComponentID {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('native command report identity');
  return ComponentID.fromString(value);
}

export function hydrateRustWorkspaceCommand(value: any, options: RustWorkspaceCommandOptions) {
  record(value, [
    'components',
    'failedComponents',
    'version',
    'removedComponents',
    'addedComponents',
    'leftUnresolvedConflicts',
    'mergeSnapResults',
    'mergeSnapError',
  ]);
  if (value.version !== undefined && typeof value.version !== 'string')
    throw new Error('native command report version');
  if (value.leftUnresolvedConflicts !== undefined && typeof value.leftUnresolvedConflicts !== 'boolean')
    throw new Error('native command report conflicts');
  const result: ApplyVersionResults = {
    ...value,
    components: rows(value.components).map((row) => {
      record(row, ['id', 'filesStatus']);
      record(row.filesStatus, Object.keys(row.filesStatus || {}));
      if (
        Object.values(row.filesStatus).some(
          (status) => typeof status !== 'string' || !Object.hasOwn(FileStatus, status)
        )
      )
        throw new Error('native command report file status');
      return {
        id: id(row.id),
        filesStatus: Object.fromEntries(
          Object.entries(row.filesStatus).map(([file, status]) => [file, FileStatus[status as keyof typeof FileStatus]])
        ),
      };
    }),
    failedComponents: rows(value.failedComponents).map((row) => {
      record(row, ['id', 'unchangedMessage', 'unchangedLegitimately']);
      if (typeof row.unchangedMessage !== 'string' || row.unchangedLegitimately !== true)
        throw new Error('native command report failure');
      return { ...row, id: id(row.id) };
    }),
    removedComponents: rows(value.removedComponents).map(id),
    addedComponents: rows(value.addedComponents).map(id),
    verbose: options.verbose,
  };
  if (value.mergeSnapResults) {
    record(value.mergeSnapResults, ['snappedComponents', 'autoSnappedResults']);
    result.mergeSnapResults = {
      snappedComponents: rows(value.mergeSnapResults.snappedComponents).map((row) => {
        record(row, ['id']);
        return { id: id(row.id) };
      }) as any,
      autoSnappedResults: rows(value.mergeSnapResults.autoSnappedResults).map((row) => {
        record(row, ['component', 'triggeredBy']);
        record(row.component, ['id']);
        return {
          component: { id: id(row.component.id) },
          triggeredBy: ComponentIdList.fromArray(rows(row.triggeredBy).map(id)),
        };
      }) as any,
    };
  }
  if (value.mergeSnapError !== undefined) {
    record(value.mergeSnapError, ['kind', 'components']);
    if (value.mergeSnapError.kind !== 'componentsHaveIssues') throw new Error('native command snap error kind');
    const components = rows(value.mergeSnapError.components).map((component) => {
      record(component, ['id', 'issues']);
      const issues = rows(component.issues);
      if (!issues.length) throw new Error('native command snap issues absent');
      for (const issue of issues) {
        record(issue, ['type', 'data']);
        if (issue.type !== 'MissingManuallyConfiguredPackages' || typeof issue.data !== 'string')
          throw new Error('native command snap issue type');
        const packages = JSON.parse(issue.data);
        if (!Array.isArray(packages) || !packages.length || packages.some((name) => typeof name !== 'string'))
          throw new Error('native command snap issue packages');
      }
      return { id: id(component.id), issues: IssuesList.deserialize(issues) };
    });
    if (!components.length) throw new Error('native command snap error components absent');
    result.mergeSnapError = new ComponentsHaveIssues(components as any);
  }
  return result;
}

export function formatRustWorkspaceCommand(value: any, options: RustWorkspaceCommandOptions) {
  const result = hydrateRustWorkspaceCommand(value, options);
  if (options.operation === 'merge') {
    // MergeLaneCmd forwards the full result, including manual conflict and removal reporting.
    if (options.lane) {
      const report = mergeReport(result);
      if (typeof report === 'string') return joinSections([report]);
      return {
        data: joinSections([report.data]),
        code: report.code,
        details: report.details ? joinSections([report.details]) : undefined,
      };
    }
    // Match MergeCmd's public report projection, including its manual-conflict output.
    return mergeReport({
      components: result.components,
      failedComponents: result.failedComponents,
      version: result.version,
      mergeSnapResults: result.mergeSnapResults,
      mergeSnapError: result.mergeSnapError,
      verbose: result.verbose,
    });
  }
  return checkoutOutput(result, {
    head: options.to === 'head',
    latest: options.to === 'latest',
    reset: options.to === 'reset',
    main: options.to === 'main',
    all: options.all,
    verbose: options.verbose,
  });
}
