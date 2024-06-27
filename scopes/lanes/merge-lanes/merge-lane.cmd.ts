import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { MergeStrategy } from '@teambit/merging';
import { mergeReport } from '@teambit/merging';
import { GlobalConfigMain } from '@teambit/global-config';
import { COMPONENT_PATTERN_HELP, CFG_FORCE_LOCAL_BUILD } from '@teambit/legacy/dist/constants';
import { BitError } from '@teambit/bit-error';
import { removeTemplate } from '@teambit/remove';
import { MergeLanesMain } from './merge-lanes.main.runtime';

export class MergeLaneCmd implements Command {
  name = 'merge <lane> [pattern]';
  description = `merge a local or a remote lane to the current lane`;
  extendedDescription = `by default, the provided lane will be fetched from the remote before merging.
to merge the lane from the local scope without updating it first, use "--skip-fetch" flag.

when the current and merge candidate lanes are diverged in history and the files could be merged with no conflicts,
these components will be snap-merged to complete the merge. use "no-snap" to opt-out, or "tag" to tag instead.

in case a component in both ends don't share history (no snap is found in common), the merge will require "--resolve-unrelated" flag.
this flag keeps the history of one end and saves a reference to the other end. the decision of which end to keep is determined by the following:
1. if the component exists on main, then the history linked to main will be kept.
in this case, the strategy of "--resolve-unrelated" only determines which source-code to keep. it's not about the history.
2. if the component doesn't exist on main, then by default, the history of the current lane will be kept.
unless "--resolve-unrelated" is set to "theirs", in which case the history of the other lane will be kept.
2. a. an edge case: if the component is deleted on the current lane, the strategy will always be "theirs".
so then the history (and the source-code) of the other lane will be kept.
`;
  arguments = [
    {
      name: 'lane',
      description: 'lane-name or full lane-id (if remote) to merge to the current lane',
    },
    {
      name: 'pattern',
      description: `partially merge the lane - only components that match the specified component-pattern
Component pattern format: ${COMPONENT_PATTERN_HELP}`,
    },
  ];
  alias = '';
  options = [
    [
      '',
      'manual',
      'same as "--auto-merge-resolve manual". in case of merge conflict, write the files with the conflict markers',
    ],
    [
      'r',
      'auto-merge-resolve <merge-strategy>',
      'in case of a merge conflict, resolve according to the provided strategy: [ours, theirs, manual]',
    ],
    ['', 'ours', 'DEPRECATED. use --auto-merge-resolve. in case of a conflict, keep local modifications'],
    ['', 'theirs', 'DEPRECATED. use --auto-merge-resolve. in case of a conflict, override local with incoming changes'],
    ['', 'workspace', 'merge only lane components that are in the current workspace'],
    ['', 'no-snap', 'do not auto snap after merge completed without conflicts'],
    ['', 'tag', 'auto-tag all lane components after merging into main (or tag-merge in case of snap-merge)'],
    ['', 'build', 'in case of snap during the merge, run the build-pipeline (similar to bit snap --build)'],
    ['m', 'message <message>', 'override the default message for the auto snap'],
    ['', 'keep-readme', 'skip deleting the lane readme component after merging'],
    ['', 'no-squash', 'relevant for merging lanes into main, which by default squashes all lane snaps'],
    [
      '',
      'squash',
      'EXPERIMENTAL. relevant for merging a lane into another non-main lane, which by default does not squash',
    ],
    [
      '',
      'ignore-config-changes',
      'allow merging when components are modified due to config changes (such as dependencies) only and not files',
    ],
    ['', 'verbose', 'show details of components that were not merged successfully'],
    ['x', 'skip-dependency-installation', 'do not install dependencies of the imported components'],
    ['', 'skip-fetch', 'use the local state of target-lane if exits locally, without updating it from the remote'],
    [
      '',
      'include-deps',
      'relevant for "--pattern" and "--workspace". merge also dependencies of the specified components',
    ],
    [
      '',
      'resolve-unrelated [merge-strategy]',
      'relevant when a component on a lane and the component on main have nothing in common. merge-strategy can be "ours" (default) or "theirs"',
    ],
    [
      '',
      'include-non-lane-comps',
      'DEPRECATED (this is now the default). when merging main, include workspace components that are not on the lane (by default only lane components are merged)',
    ],
    [
      '',
      'exclude-non-lane-comps',
      'when merging main into a lane, exclude workspace components that are not on the lane (by default all workspace components are merged)',
    ],
  ] as CommandOptions;
  loader = true;
  private = true;
  remoteOp = true;

  constructor(private mergeLanes: MergeLanesMain, private globalConfig: GlobalConfigMain) {}

  async report(
    [name, pattern]: [string, string],
    {
      ours,
      theirs,
      manual,
      autoMergeResolve,
      build,
      workspace: existingOnWorkspaceOnly = false,
      squash = false,
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
      excludeNonLaneComps = false,
    }: {
      ours?: boolean;
      theirs?: boolean;
      manual?: boolean;
      autoMergeResolve?: string;
      workspace?: boolean;
      build?: boolean;
      noSnap: boolean;
      tag: boolean;
      message: string;
      keepReadme?: boolean;
      squash?: boolean;
      noSquash: boolean;
      skipDependencyInstallation?: boolean;
      skipFetch: boolean;
      includeDeps?: boolean;
      resolveUnrelated?: string | boolean;
      ignoreConfigChanges?: boolean;
      verbose?: boolean;
      excludeNonLaneComps?: boolean;
    }
  ): Promise<string> {
    build = (await this.globalConfig.getBool(CFG_FORCE_LOCAL_BUILD)) || Boolean(build);
    if (ours || theirs) {
      throw new BitError(
        'the "--ours" and "--theirs" flags are deprecated. use "--auto-merge-resolve" instead. see "bit lane merge --help" for more information'
      );
    }
    if (
      autoMergeResolve &&
      autoMergeResolve !== 'ours' &&
      autoMergeResolve !== 'theirs' &&
      autoMergeResolve !== 'manual'
    ) {
      throw new BitError('--auto-merge-resolve must be one of the following: [ours, theirs, manual]');
    }
    if (manual) autoMergeResolve = 'manual';
    const mergeStrategy = autoMergeResolve;
    if (noSnap && snapMessage) throw new BitError('unable to use "no-snap" and "message" flags together');
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
    const { mergeResults, deleteResults, configMergeResults } = await this.mergeLanes.mergeLaneByCLI(name, {
      build,
      // @ts-ignore
      mergeStrategy,
      ours,
      theirs,
      existingOnWorkspaceOnly,
      noSnap,
      snapMessage,
      keepReadme,
      squash,
      noSquash,
      tag,
      pattern,
      skipDependencyInstallation,
      skipFetch,
      resolveUnrelated: getResolveUnrelated(),
      ignoreConfigChanges,
      includeDeps,
      excludeNonLaneComps,
    });

    const mergeResult = mergeReport({ ...mergeResults, configMergeResults, verbose });
    const deleteOutput = `\n${deleteResults.localResult ? removeTemplate(deleteResults.localResult, false) : ''}${(
      deleteResults.remoteResult || []
    ).map((item) => removeTemplate(item, true))}${
      (deleteResults.readmeResult && chalk.yellow(deleteResults.readmeResult)) || ''
    }\n`;
    return mergeResult + deleteOutput;
  }
}
