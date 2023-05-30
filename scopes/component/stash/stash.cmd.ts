// eslint-disable-next-line max-classes-per-file
import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { StashMain } from './stash.main.runtime';

export class StashSaveCmd implements Command {
  name = 'save';
  description = 'stash modified components';
  group = 'development';
  options = [
    ['p', 'pattern', COMPONENT_PATTERN_HELP],
    ['m', 'message <string>', 'message to be attached to the stashed components'],
  ] as CommandOptions;
  loader = true;

  constructor(private stash: StashMain) {}

  async report(
    _arg: any,
    {
      pattern,
      message,
    }: {
      pattern?: string;
      message?: string;
    }
  ) {
    const compIds = await this.stash.save({ pattern, message });
    return chalk.green(`stashed ${compIds.length} components`);
  }
}

export class StashLoadCmd implements Command {
  name = 'load';
  description = 'load latest stash, checkout components and delete stash';
  group = 'development';
  options = [] as CommandOptions;
  loader = true;

  constructor(private stash: StashMain) {}

  async report() {
    const compIds = await this.stash.loadLatest();
    return chalk.green(`checked out ${compIds.length} components according to the latest stash`);
  }
}

export class StashCmd implements Command {
  name = 'stash [sub-command]';
  description = 'EXPERIMENTAL (more like a POC). stash modified components';
  group = 'development';
  private = true; // too early to make it public. it's still in a POC mode.
  options = [
    ['p', 'pattern', COMPONENT_PATTERN_HELP],
    ['m', 'message <string>', 'message to be attached to the stashed components'],
  ] as CommandOptions;
  loader = true;
  commands: Command[] = [];

  constructor(private stash: StashMain) {}

  async report(
    _arg: any,
    {
      pattern,
      message,
    }: {
      pattern?: string;
      message?: string;
    }
  ) {
    return new StashSaveCmd(this.stash).report(undefined, { pattern, message });
  }
}
