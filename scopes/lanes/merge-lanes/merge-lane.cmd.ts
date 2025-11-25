import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import { mergeReport } from '@teambit/merging';
import { COMPONENT_PATTERN_HELP, CFG_FORCE_LOCAL_BUILD } from '@teambit/legacy.constants';
import { BitError } from '@teambit/bit-error';
import { removeTemplate } from '@teambit/remove';
import type { MergeLanesMain } from './merge-lanes.main.runtime';
import type { ConfigStoreMain } from '@teambit/config-store';

export class MergeLaneCmd implements Command {
  name = 'merge <lane> [pattern]';
  description = `merge a local or a remote lane to the current lane`;
  extendedDescription = `by default, the provided lane will be fetched from the remote before merging.
to merge the lane from the local scope without updating it first, use "--skip-fetch" flag.

when the current and merge candidate lanes are diverged in history and the files could be merged with no conflicts,
these components will be snap-merged to complete the merge. use "no-auto-snap" to opt-out, or "tag" to tag instead.

when the components are not diverged in history, and the current lane is behind the merge candidate, the merge will
simply update the components and the heads according to the merge candidate.
to opt-out, use "--no-snap", the components will be written as the merge candidate, and will be left as modified.

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
    [
      '',
      'no-auto-snap',
      'do not auto snap after merge completed without conflicts of diverged components (see command description)',
    ],
    ['', 'no-snap', 'do not pass snaps from the other lane even for non-diverged components (see command description)'],
    ['', 'tag', 'auto-tag all lane components after merging into main (or tag-merge in case of snap-merge)'],
    ['', 'build', 'in case of snap during the merge, run the build-pipeline (similar to bit snap --build)'],
    ['', 'loose', 'relevant for --build, to allow build to succeed even if tasks like tests or lint fail'],
    ['m', 'message <message>', 'override the default message for the auto snap'],
    ['', 'keep-readme', 'skip deleting the lane readme component after merging'],
    ['', 'no-squash', 'relevant for merging lanes into main, which by default squashes all lane snaps'],
    ['', 'squash', 'relevant for merging a lane into another non-main lane, which by default does not squash'],
    [
      '',
      'ignore-config-changes',
      'allow merging when components are modified due to config changes (such as dependencies) only and not files',
    ],
    ['', 'verbose', 'display detailed information about components that were legitimately unmerged'],
    ['x', 'skip-dependency-installation', 'do not install dependencies of the imported components'],
    ['', 'skip-fetch', 'use the local state of target-lane if exits locally, without updating it from the remote'],
    [
      '',
      'include-deps',
      'relevant for "pattern" and "--workspace". merge also dependencies of the specified components',
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
    [
      '',
      'detach-head',
      'UNSUPPORTED YET. for each component, find the divergent point from main and merge to that point. do not change the head',
    ],
  ] as CommandOptions;
  loader = true;
  private = true;
  remoteOp = true;

  constructor(
    private mergeLanes: MergeLanesMain,
    private configStore: ConfigStoreMain
  ) {}

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
      noAutoSnap = false,
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
      detachHead,
      loose = false,
    }: {
      ours?: boolean;
      theirs?: boolean;
      manual?: boolean;
      autoMergeResolve?: string;
      workspace?: boolean;
      build?: boolean;
      noAutoSnap: boolean;
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
      detachHead?: boolean;
      loose?: boolean;
    }
  ): Promise<string> {
    build = this.configStore.getConfigBoolean(CFG_FORCE_LOCAL_BUILD) || Boolean(build);
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
    if (noAutoSnap && snapMessage) throw new BitError('unable to use "no-snap" and "message" flags together');
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
      noAutoSnap,
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
      detachHead,
      loose,
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
