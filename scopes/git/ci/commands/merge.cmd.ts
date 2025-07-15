import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, type Workspace } from '@teambit/workspace';
import { ReleaseType } from 'semver';
import { validateOptions } from '@teambit/snapping';
import { CiMain } from '../ci.main.runtime';

type Options = {
  message?: string;
  build?: boolean;
  strict?: boolean;
  increment?: ReleaseType;
  patch?: boolean;
  minor?: boolean;
  major?: boolean;
  preRelease?: string;
  prereleaseId?: string;
  incrementBy?: number;
};

export class CiMergeCmd implements Command {
  name = 'merge';
  description = 'Merges a PR';
  group = 'collaborate';

  options: CommandOptions = [
    ['m', 'message <message>', 'If set, use it as the snap message, if not, try and grab from git-commit-message'],
    ['b', 'build', 'Set to true to build the app locally, false (default) will build on Ripple CI'],
    ['s', 'strict', 'Set to true to fail on warnings as well as errors, false (default) only fails on errors'],
    [
      'l',
      'increment <level>',
      'options are: [major, premajor, minor, preminor, patch, prepatch, prerelease], default to patch',
    ],
    ['', 'prerelease-id <id>', 'prerelease identifier (e.g. "dev" to get "1.0.0-dev.1")'],
    ['p', 'patch', 'syntactic sugar for "--increment patch"'],
    ['', 'minor', 'syntactic sugar for "--increment minor"'],
    ['', 'major', 'syntactic sugar for "--increment major"'],
    ['', 'pre-release [identifier]', 'syntactic sugar for "--increment prerelease" and `--prerelease-id <identifier>`'],
    [
      '',
      'increment-by <number>',
      '(default to 1) increment semver flag (patch/minor/major) by. e.g. incrementing patch by 2: 0.0.1 -> 0.0.3.',
    ],
  ];

  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private ci: CiMain
  ) {}

  async report(args: unknown, options: Options) {
    this.logger.console('\n\n');
    this.logger.console('🚀 Initializing Merge command');
    if (!this.workspace) throw new OutsideWorkspaceError();

    const { releaseType, preReleaseId } = validateOptions(options);

    return this.ci.mergePr({
      message: options.message,
      build: options.build,
      strict: options.strict,
      releaseType,
      preReleaseId,
      incrementBy: options.incrementBy,
    });
  }
}
