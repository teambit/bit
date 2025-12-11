// eslint-disable-next-line max-classes-per-file
import chalk from 'chalk';
import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import type { Command, CommandOptions } from '@teambit/cli';
import type { CheckoutProps } from '@teambit/checkout';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import { BitError } from '@teambit/bit-error';
import type { StashMain } from './stash.main.runtime';

export class StashSaveCmd implements Command {
  name = 'save';
  alias = 's';
  description = 'stash modified components';
  group = 'version-control';
  options = [
    ['p', 'pattern', COMPONENT_PATTERN_HELP],
    [
      '',
      'include-new',
      'EXPERIMENTAL. by default, only modified components are stashed. use this flag to include new components',
    ],
    ['m', 'message <string>', 'message to be attached to the stashed components'],
  ] as CommandOptions;
  loader = true;

  constructor(private stash: StashMain) {}

  async report(
    _arg: any,
    {
      pattern,
      message,
      includeNew,
    }: {
      pattern?: string;
      message?: string;
      includeNew?: boolean;
    }
  ) {
    const compIds = await this.stash.save({ pattern, message, includeNew });
    return chalk.green(`stashed ${compIds.length} components`);
  }
}

export class StashListCmd implements Command {
  name = 'list';
  description = 'list stash';
  group = 'version-control';
  options = [] as CommandOptions;
  loader = true;

  constructor(private stash: StashMain) {}

  async report() {
    const list = await this.stash.list();
    return list
      .map((listItem) => `${listItem.id} (${listItem.components.length} components) ${listItem.message || ''}`)
      .join('\n');
  }
}

type StashLoadOpts = {
  autoMergeResolve?: MergeStrategy;
  manual?: boolean;
  forceOurs?: boolean;
  forceTheirs?: boolean;
};

export class StashLoadCmd implements Command {
  name = 'load [stash-id]';
  alias = 'pop';
  description = 'apply the changes according to the stash. if no stash-id provided, it loads the latest stash';
  group = 'version-control';
  options = [
    [
      'r',
      'auto-merge-resolve <merge-strategy>',
      'in case of merge conflict, resolve according to the provided strategy: [ours, theirs, manual]',
    ],
    [
      '',
      'manual',
      'same as "--auto-merge-resolve manual". in case of merge conflict, write the files with the conflict markers',
    ],
    ['', 'force-ours', 'do not merge, preserve local files as is'],
    ['', 'force-theirs', 'do not merge, just overwrite with incoming files'],
  ] as CommandOptions;
  loader = true;

  constructor(private stash: StashMain) {}

  async report([stashId]: [string], { autoMergeResolve, forceOurs, forceTheirs, manual }: StashLoadOpts) {
    if (forceOurs && forceTheirs) {
      throw new BitError('please use either --force-ours or --force-theirs, not both');
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

    const checkoutProps: CheckoutProps = {
      mergeStrategy: autoMergeResolve,
      forceOurs,
      forceTheirs,
    };
    const compIds = await this.stash.loadLatest(checkoutProps, stashId);
    return chalk.green(`checked out ${compIds.length} components according to the latest stash`);
  }
}

export class StashCmd implements Command {
  name = 'stash <sub-command>';
  description = 'temporarily save and restore component changes';
  extendedDescription = `temporarily stores modified component files without creating versions.
allows saving work-in-progress changes and switching context, then restoring changes later.`;
  group = 'version-control';
  options = [
    ['p', 'pattern', COMPONENT_PATTERN_HELP],
    ['m', 'message <string>', 'message to be attached to the stashed components'],
  ] as CommandOptions;
  loader = true;
  commands: Command[] = [];

  constructor(private stash: StashMain) {}

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "stash", please run "bit stash --help" to list the subcommands`
    );
  }
}
