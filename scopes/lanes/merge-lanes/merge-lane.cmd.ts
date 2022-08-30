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
  extendedDescription = `if the <lane> exists locally, it will be merged from the local lane.
otherwise, it will fetch the lane from the remote and merge it.
in case the <lane> exists locally but you want to merge the remote version of it, use --remote flag`;
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
    ['', 'build', 'in case of snap during the merge, run the build-pipeline (similar to bit snap --build)'],
    ['m', 'message <message>', 'override the default message for the auto snap'],
    ['', 'keep-readme', 'skip deleting the lane readme component after merging'],
    ['', 'squash', 'EXPERIMENTAL. squash multiple snaps. keep the last one only'],
    ['', 'verbose', 'show details of components that were not merged legitimately'],
    ['', 'skip-dependency-installation', 'do not install packages of the imported components'],
    ['', 'remote', 'relevant when the target-lane locally is differ than the remote and you want the remote'],
    [
      '',
      'include-deps',
      'EXPERIMENTAL. relevant for "--pattern" and "--workspace". merge also dependencies of the given components',
    ],
    [
      '',
      'resolve-unrelated [merge-strategy]',
      'EXPERIMENTAL. relevant when a component on a lane and the component on main has nothing in common. default-strategy is "ours"',
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
      message: snapMessage = '',
      keepReadme = false,
      squash = false,
      skipDependencyInstallation = false,
      remote = false,
      includeDeps = false,
      resolveUnrelated,
      verbose = false,
    }: {
      ours: boolean;
      theirs: boolean;
      manual: boolean;
      workspace?: boolean;
      build?: boolean;
      noSnap: boolean;
      message: string;
      keepReadme?: boolean;
      squash: boolean;
      skipDependencyInstallation?: boolean;
      remote: boolean;
      includeDeps?: boolean;
      resolveUnrelated?: string | boolean;
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
    const { mergeResults, deleteResults } = await this.mergeLanes.mergeLane(name, {
      build,
      // @ts-ignore
      mergeStrategy,
      existingOnWorkspaceOnly,
      noSnap,
      snapMessage,
      keepReadme,
      squash,
      pattern,
      skipDependencyInstallation,
      remote,
      resolveUnrelated: getResolveUnrelated(),
      includeDeps,
    });

    const mergeResult = mergeReport({ ...mergeResults, verbose });
    const deleteResult = `${deleteResults.localResult ? paintRemoved(deleteResults.localResult, false) : ''}${(
      deleteResults.remoteResult || []
    ).map((item) => paintRemoved(item, true))}${
      (deleteResults.readmeResult && chalk.yellow(deleteResults.readmeResult)) || ''
    }\n`;
    return mergeResult + deleteResult;
  }
}
