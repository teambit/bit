import type { CommandDescriptor, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';

/**
 * Declarative descriptors for the status aspect's commands.
 *
 * Pilot of Slice 3 in the ESM Migration with Lazy-Loaded Aspects RFC
 * (docs/rfc-esm-lazy-aspects.md §6.2). Each descriptor is the single source
 * of truth for its command's static fields; the matching handler class
 * (`StatusCmd`, `MiniStatusCmd`) reads these fields rather than redeclaring
 * them, and `cli.register(descriptor, factory)` consumes the pair.
 */
export const statusCommand: CommandDescriptor = {
  name: 'status',
  alias: 's',
  description: 'show workspace component status and issues',
  group: 'info-analysis',
  extendedDescription: `displays the current state of all workspace components including new, modified, staged, and problematic components.
identifies blocking issues that prevent tagging/snapping and provides warnings with --warnings flag.
essential for understanding workspace health before versioning components.
use --quick for a faster check that only detects file-level changes (new/modified components).
for maximum speed (skips aspect loading entirely), use "bit mini-status".`,
  options: [
    ['j', 'json', 'return a json version of the component'],
    ['w', 'warnings', 'show warnings. by default, only issues that block tag/snap are shown'],
    ['', 'verbose', 'show extra data: full snap hashes for staged components, and divergence point for lanes'],
    ['l', 'lanes', 'when on a lane, show updates from main and updates from forked lanes'],
    ['', 'strict', 'exit with code 1 if any issues are found (both errors and warnings)'],
    ['', 'fail-on-error', 'exit with code 1 only when tag/snap blocker issues are found (not warnings)'],
    ['c', 'ignore-circular-dependencies', 'do not check for circular dependencies to get the results quicker'],
    [
      '',
      'quick',
      'show only new and modified components based on file changes. much faster, but does not detect dependency or config changes',
    ],
    ['', 'expand', 'expand all collapsed sections (e.g. auto-tag pending components)'],
  ] as CommandOptions,
  loader: true,
};

export const miniStatusCommand: CommandDescriptor = {
  name: 'mini-status [component-pattern]',
  description: 'basic status for fast execution',
  extendedDescription: `shows only modified/new components with code changes. for the full status, use "bit status".
this command only checks source code changes, it doesn't check for config/aspect/dependency changes`,
  arguments: [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ],
  group: 'info-analysis',
  alias: 'ms',
  private: true,
  options: [
    ['', 'show-issues', 'show component issues (slows down the command)'],
    [
      'c',
      'ignore-circular-dependencies',
      'do not check for circular dependencies to get the results quicker (relevant when --show-issues flag is used)',
    ],
    ['j', 'json', 'json format'],
  ] as CommandOptions,
  loadAspects: false,
  loader: true,
};
