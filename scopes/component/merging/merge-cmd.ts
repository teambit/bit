import type { Command, CommandOptions } from '@teambit/cli';
import { formatItem, formatSection } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP, CFG_FORCE_LOCAL_BUILD } from '@teambit/legacy.constants';
import { BitError } from '@teambit/bit-error';
import type { MergeStrategy, ApplyVersionResults } from '@teambit/component.modules.merge-helper';
import { mergeReport } from './merge-report';
export { mergeReport } from './merge-report';
import type { MergingMain } from './merging.main.runtime';
import type { ConfigStoreMain } from '@teambit/config-store';

export class MergeCmd implements Command {
  name = 'merge [component-pattern]';
  description = 'merge diverged component history when local and remote have different versions';
  helpUrl = 'reference/components/merging-changes';
  group = 'version-control';
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  extendedDescription = `resolves diverged component history when both local and remote have created different snaps/tags from the same base version.
if no component pattern is specified, all pending-merge components will be merged (run 'bit status' to list them).
'bit status' will show diverged components and suggest either merging or resetting local changes.
preferred approach: use 'bit reset' to remove local versions, then 'bit checkout head' to get remote versions.
for lane-to-lane merging, use 'bit lane merge' instead.`;
  alias = '';
  options = [
    ['', 'ours', 'DEPRECATED. use --auto-merge-resolve. in case of a conflict, keep the local modification'],
    [
      '',
      'theirs',
      'DEPRECATED. use --auto-merge-resolve. in case of a conflict, override the local modification with the specified version',
    ],
    [
      '',
      'manual',
      'same as "--auto-merge-resolve manual". in case of merge conflict, write the files with the conflict markers',
    ],
    [
      'r',
      'auto-merge-resolve <merge-strategy>',
      'in case of a conflict, resolve according to the strategy: [ours, theirs, manual]',
    ],
    ['', 'abort', 'in case of an unresolved merge, revert to pre-merge state'],
    ['', 'resolve', 'mark an unresolved merge as resolved and create a new snap with the changes'],
    ['', 'no-snap', 'do not auto snap even if the merge completed without conflicts'],
    ['', 'build', 'in case of snap during the merge, run the build-pipeline (similar to bit snap --build)'],
    ['', 'verbose', 'show details of components that were not merged successfully'],
    ['x', 'skip-dependency-installation', 'do not install new dependencies resulting from the merge'],
    ['m', 'message <message>', 'override the default message for the auto snap'],
  ] as CommandOptions;
  loader = true;

  constructor(
    private merging: MergingMain,
    private configStore: ConfigStoreMain
  ) {}

  async report(
    [pattern]: [string],
    {
      ours = false,
      theirs = false,
      manual = false,
      autoMergeResolve,
      abort = false,
      resolve = false,
      build = false,
      noSnap = false,
      verbose = false,
      message,
      skipDependencyInstallation = false,
    }: {
      ours?: boolean;
      theirs?: boolean;
      manual?: boolean;
      autoMergeResolve?: MergeStrategy;
      abort?: boolean;
      resolve?: boolean;
      build?: boolean;
      noSnap?: boolean;
      verbose?: boolean;
      message: string;
      skipDependencyInstallation?: boolean;
    }
  ) {
    build = this.configStore.getConfigBoolean(CFG_FORCE_LOCAL_BUILD) || Boolean(build);
    if (ours || theirs) {
      throw new BitError('the "--ours" and "--theirs" flags are deprecated. use "--auto-merge-resolve" instead');
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
    if (abort && resolve) throw new BitError('unable to use "abort" and "resolve" flags together');
    if (noSnap && message) throw new BitError('unable to use "noSnap" and "message" flags together');
    const {
      components,
      failedComponents,
      version,
      resolvedComponents,
      abortedComponents,
      mergeSnapResults,
      mergeSnapError,
    }: ApplyVersionResults = await this.merging.merge(
      pattern,
      autoMergeResolve as any,
      abort,
      resolve,
      noSnap,
      message,
      build,
      skipDependencyInstallation
    );
    if (resolvedComponents) {
      const items = resolvedComponents.map((c) => formatItem(c.id.toStringWithoutVersion()));
      return formatSection('resolved components', '', items);
    }
    if (abortedComponents) {
      const items = abortedComponents.map((c) => formatItem(c.id.toStringWithoutVersion()));
      return formatSection('merge aborted', '', items);
    }

    return mergeReport({
      components,
      failedComponents,
      version,
      mergeSnapResults,
      mergeSnapError,
      verbose,
    });
  }
}
