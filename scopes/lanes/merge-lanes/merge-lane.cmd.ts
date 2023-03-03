import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { getMergeStrategy, MergeStrategy } from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { mergeReport } from '@teambit/merging';
import { BUILD_ON_CI, isFeatureEnabled } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { BitError } from '@teambit/bit-error';
import paintRemoved from '@teambit/legacy/dist/cli/templates/remove-template';
import { MergeLanesMain } from './merge-lanes.main.runtime';

export class MergeLaneCmd implements Command {
  name = 'merge <lane> [pattern]';
  description = `merge a local or a remote lane`;
  extendedDescription = `by default, the provided lane will be fetched from the remote before merging.
to merge the lane from the local scope without updating it first, use "--skip-fetch" flag.

when the current and the other lanes are diverged in history and the files could be merged with no conflicts,
it will snap-merge these components to complete the merge. use "no-snap" to opt-out, or "tag" to tag instead`;
  arguments = [
    {
      name: 'lane',
      description: 'lane-name or lane-id (if not exists locally) to merge to the current lane',
    },
    {
      name: 'pattern',
      description: 'EXPERIMENTAL. partially merge the lane with the specified component-pattern',
    },
  ];
  alias = '';
  options = [
    ['', 'ours', 'in case of a conflict, override the used version with the current modification'],
    ['', 'theirs', 'in case of a conflict, override the current modification with the specified version'],
    ['', 'manual', 'in case of a conflict, leave the files with a conflict state to resolve them manually later'],
    ['', 'workspace', 'merge only components in a lane that exist in the workspace'],
    ['', 'no-snap', 'do not auto snap in case the merge completed without conflicts'],
    ['', 'tag', 'tag all lane components after merging into main (also tag-merge in case of snap-merge)'],
    ['', 'build', 'in case of snap during the merge, run the build-pipeline (similar to bit snap --build)'],
    ['m', 'message <message>', 'override the default message for the auto snap'],
    ['', 'keep-readme', 'skip deleting the lane readme component after merging'],
    ['', 'no-squash', 'EXPERIMENTAL. relevant for merging lanes into main, which by default squash.'],
    [
      '',
      'ignore-config-changes',
      'allow merging when component are modified due to config changes (such as dependencies) only and not files',
    ],
    ['', 'verbose', 'show details of components that were not merged legitimately'],
    ['x', 'skip-dependency-installation', 'do not install packages of the imported components'],
    ['', 'skip-fetch', 'use the current target-lane if exits locally without updating it from the remote'],
    [
      '',
      'include-deps',
      'EXPERIMENTAL. relevant for "--pattern" and "--workspace". merge also dependencies of the given components',
    ],
    [
      '',
      'resolve-unrelated [merge-strategy]',
      'EXPERIMENTAL. relevant when a component on a lane and the component on main has nothing in common. merge-strategy can be "ours" (default) or "theirs"',
    ],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;
  remoteOp = true;

  constructor(private mergeLanes: MergeLanesMain) {}

  async report(
    [name, pattern]: [string, string],
    {
      ours = false,
      theirs = false,
      manual = false,
      build,
      workspace: existingOnWorkspaceOnly = false,
      noSnap = false,
      tag = false,
      message: snapMessage = '',
      keepReadme = false,
      noSquash = false,
      skipDependencyInstallation = false,
      skipFetch = false,
      includeDeps = false,
      resolveUnrelated,
      ignoreConfigChanges,
      verbose = false,
    }: {
      ours: boolean;
      theirs: boolean;
      manual: boolean;
      workspace?: boolean;
      build?: boolean;
      noSnap: boolean;
      tag: boolean;
      message: string;
      keepReadme?: boolean;
      noSquash: boolean;
      skipDependencyInstallation?: boolean;
      skipFetch: boolean;
      includeDeps?: boolean;
      resolveUnrelated?: string | boolean;
      ignoreConfigChanges?: boolean;
      verbose?: boolean;
    }
  ): Promise<string> {
    build = isFeatureEnabled(BUILD_ON_CI) ? Boolean(build) : true;
    const mergeStrategy = getMergeStrategy(ours, theirs, manual);
    if (noSnap && snapMessage) throw new BitError('unable to use "noSnap" and "message" flags together');
    if (includeDeps && !pattern && !existingOnWorkspaceOnly) {
      throw new BitError(`"--include-deps" flag is relevant only for --workspace and --pattern flags`);
    }
    const getResolveUnrelated = (): MergeStrategy | undefined => {
      if (!resolveUnrelated) return undefined;
      if (typeof resolveUnrelated === 'boolean') return 'ours';
      if (resolveUnrelated !== 'ours' && resolveUnrelated !== 'theirs' && resolveUnrelated !== 'manual') {
        throw new Error('--resolve-unrelated must be one of the following: [ours, theirs, manual]');
      }
      return resolveUnrelated;
    };
    if (resolveUnrelated && typeof resolveUnrelated === 'boolean') {
      resolveUnrelated = 'ours';
    }
    const { mergeResults, deleteResults, configMergeResults } = await this.mergeLanes.mergeLane(name, {
      build,
      // @ts-ignore
      mergeStrategy,
      existingOnWorkspaceOnly,
      noSnap,
      snapMessage,
      keepReadme,
      noSquash,
      tag,
      pattern,
      skipDependencyInstallation,
      skipFetch,
      resolveUnrelated: getResolveUnrelated(),
      ignoreConfigChanges,
      includeDeps,
    });

    const mergeResult = mergeReport({ ...mergeResults, configMergeResults, verbose });
    const deleteResult = `${deleteResults.localResult ? paintRemoved(deleteResults.localResult, false) : ''}${(
      deleteResults.remoteResult || []
    ).map((item) => paintRemoved(item, true))}${
      (deleteResults.readmeResult && chalk.yellow(deleteResults.readmeResult)) || ''
    }\n`;
    return mergeResult + deleteResult;
  }
}
