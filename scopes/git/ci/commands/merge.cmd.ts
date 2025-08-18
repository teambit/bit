import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import { OutsideWorkspaceError, type Workspace } from '@teambit/workspace';
import type { ReleaseType } from 'semver';
import { validateOptions } from '@teambit/snapping';
import { BitError } from '@teambit/bit-error';
import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import type { CiMain } from '../ci.main.runtime';

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
  verbose?: boolean;
  versionsFile?: string;
  autoMergeResolve?: MergeStrategy;
  forceTheirs?: boolean;
};

export class CiMergeCmd implements Command {
  name = 'merge';
  description = 'Tags and exports new semantic versions after merging a PR to main.';
  extendedDescription = `By default, bumps patch versions when merging to main. If specific configuration variables are set, it can use commit messages or explicit flags to determine the version bump. Runs install, tag, build, and export, then archives the remote lane and syncs lockfiles. Use in merge-to-main CI pipelines to publish releases.`;
  group = 'collaborate';

  options: CommandOptions = [
    ['m', 'message <message>', 'If set, use it as the tag message, if not, try and grab from git-commit-message'],
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
    ['', 'versions-file <path>', 'path to a file containing component versions. format: "component-id: version"'],
    ['', 'verbose', 'show verbose output'],
    [
      'r',
      'auto-merge-resolve <merge-strategy>',
      'in case of merge conflict during checkout, resolve according to the provided strategy: [ours, theirs, manual]',
    ],
    ['', 'force-theirs', 'do not merge during checkout, just overwrite with incoming files'],
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

    // Validate autoMergeResolve option
    if (
      options.autoMergeResolve &&
      options.autoMergeResolve !== 'ours' &&
      options.autoMergeResolve !== 'theirs' &&
      options.autoMergeResolve !== 'manual'
    ) {
      throw new BitError('--auto-merge-resolve must be one of the following: [ours, theirs, manual]');
    }

    const { releaseType, preReleaseId } = validateOptions(options);

    // Check if user explicitly provided any version bump flags
    const explicitVersionBump = Boolean(
      options.increment || options.patch || options.minor || options.major || options.preRelease
    );

    return this.ci.mergePr({
      message: options.message,
      build: options.build,
      strict: options.strict,
      releaseType,
      preReleaseId,
      incrementBy: options.incrementBy,
      explicitVersionBump,
      verbose: options.verbose,
      versionsFile: options.versionsFile,
      autoMergeResolve: options.autoMergeResolve,
      forceTheirs: options.forceTheirs,
    });
  }
}
