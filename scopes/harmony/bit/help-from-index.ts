// Render `bit --help` (top-level help only) directly from the
// auto-generated `COMMAND_INDEX`. Avoids the aspect-load pass entirely.
//
// Part of RFC ESM Migration with Lazy-Loaded Aspects — Slice 5.
// (docs/migration/05-command-index-codegen.md, acceptance: `bit --help`
// reads from ALL_DESCRIPTORS, not from a live slot.)

import chalk from 'chalk';
import type { CommandIndexEntry } from './command-index.generated';

// Inlined to keep this module's dep graph tiny — the whole point of the
// `bit --help` short-circuit is to load as little as possible.
function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
function rightpad(s: string, length: number, pad: string): string {
  return s.length >= length ? s : s + pad.repeat(length - s.length);
}

// Mirrored from scopes/harmony/cli/command-groups.ts. Kept here as a tiny
// snapshot to avoid pulling @teambit/cli's full surface area into the
// --help fast path. If the source moves, sync this list.
const STATIC_GROUPS: Record<string, string> = {
  start: 'Start a working area',
  development: 'Develop components',
  discover: 'Explore components',
  info: 'View components',
  general: 'Workspace commands',
  'workspace-setup': 'Workspace & Project Setup',
  collaborate: 'Collaboration & Remote',
  'info-analysis': 'Information & Analysis',
  'workspace-tools': 'Workspace Tools',
  'component-config': 'Component Configuration',
  'component-development': 'Component Development',
  dependencies: 'Dependencies & Packages',
  'version-control': 'Version Control',
  testing: 'Testing & Quality',
  'run-serve': 'Run & Serve',
  system: 'System & Utility',
  auth: 'Authentication & Cloud',
  advanced: 'Advanced/Debug',
  ungrouped: 'Ungrouped',
};

const SPACE = ' ';
const TITLE_LEFT_SPACES_NUMBER = 2;
const COMMAND_LEFT_SPACES_NUMBER = 4;
const NAME_WITH_SPACES_LENGTH = 16;

/**
 * Group descriptions used by the live `formatHelp` come from each aspect's
 * `cli.registerGroup(name, description)` calls. Loading aspects to recover
 * them defeats the purpose of the index. We reuse the static `groups` map
 * for the built-in groups and add an entry per aspect that calls
 * `cli.registerGroup` dynamically (currently: `apps`, `git`).
 *
 * If a new dynamic group is added or renamed, update this map. A future
 * pass can fold group descriptions into the codegen output so this map
 * stays in lockstep with the live registration automatically.
 */
const GROUP_DESCRIPTIONS: Record<string, string> = {
  ...STATIC_GROUPS,
  apps: 'Applications',
  git: 'Git',
};

type GroupContent = {
  description: string;
  commands: Array<{ name: string; description: string }>;
};

export function formatHelpFromIndex(
  index: CommandIndexEntry[],
  showPrivateCommands = false,
): string {
  const grouped = groupByGroupName(index, showPrivateCommands);
  const commandsStr = formatGroups(grouped);
  return `${getHeader()}

${commandsStr}

${getFooter()}`;
}

function groupByGroupName(
  index: CommandIndexEntry[],
  showPrivateCommands: boolean,
): Map<string, GroupContent> {
  const groups = new Map<string, GroupContent>();
  for (const entry of index) {
    if (!showPrivateCommands && entry.private) continue;
    if (!entry.description) continue;
    const groupName = entry.group || 'ungrouped';
    let group = groups.get(groupName);
    if (!group) {
      group = {
        description: GROUP_DESCRIPTIONS[groupName] ?? capitalize(groupName.replace(/-/g, ' ')),
        commands: [],
      };
      groups.set(groupName, group);
    }
    group.commands.push({ name: entry.name, description: entry.description });
  }
  return groups;
}

function formatGroups(groups: Map<string, GroupContent>): string {
  const sections: string[] = [];
  for (const group of groups.values()) {
    sections.push(formatGroup(group));
  }
  return sections.join('\n\n');
}

function formatGroup(group: GroupContent): string {
  const titleSpace = SPACE.repeat(TITLE_LEFT_SPACES_NUMBER);
  const title = `${titleSpace}${chalk.underline.bold.blue(group.description)}`;
  const commands = group.commands
    .map((cmd) => formatCommandLine(cmd.name, cmd.description))
    .join('\n');
  return `${title}\n${commands}`;
}

function formatCommandLine(name: string, description: string): string {
  const nameSpace = SPACE.repeat(COMMAND_LEFT_SPACES_NUMBER);
  const nameWithRightSpace = rightpad(name, NAME_WITH_SPACES_LENGTH, SPACE);
  return `${nameSpace}${chalk.green(nameWithRightSpace)}${description}`;
}

function getHeader(): string {
  return `${chalk.bold('usage: bit [--version] [--help] <command> [<args>]')}

${chalk.yellow(`bit documentation: https://bit.dev/`)}`;
}

function getFooter(): string {
  return chalk.yellow(`use 'bit <command> --help' for more information and guides on specific commands.
use 'bit --internal' to show advanced commands.`);
}

/**
 * Returns true when argv represents a standalone `bit --help` / `bit -h`
 * invocation that the static index can answer without loading aspects.
 *
 * Returns false when there's any positional command (`bit status --help`
 * needs the command-specific help and yargs to assemble it).
 */
export function isStandaloneHelp(argv: string[]): boolean {
  // argv starts with [node, script, ...userArgs]
  const userArgs = argv.slice(2);
  if (userArgs.length === 0) return false;
  const hasHelpFlag = userArgs.some((a) => a === '--help' || a === '-h');
  if (!hasHelpFlag) return false;
  const firstPositional = userArgs.find((a) => !a.startsWith('-'));
  return !firstPositional;
}

/**
 * True for `--internal` flag — same surface as `bit --help --internal`.
 */
export function showInternalRequested(argv: string[]): boolean {
  return argv.slice(2).some((a) => a === '--internal');
}

/**
 * Returns true when argv represents a standalone `bit --version` / `bit -v`
 * invocation. No aspect needs to load; the version string is in
 * `@teambit/bit.get-bit-version`.
 */
export function isStandaloneVersion(argv: string[]): boolean {
  const userArgs = argv.slice(2);
  if (userArgs.length === 0) return false;
  const hasVersionFlag = userArgs.some((a) => a === '--version' || a === '-v');
  if (!hasVersionFlag) return false;
  const firstPositional = userArgs.find((a) => !a.startsWith('-'));
  return !firstPositional;
}

/**
 * Returns the first positional argument (the entered command name), or
 * undefined if argv has no positional. Server-mode handshakes
 * (`server-forever`) and yargs-completion are also "no command" cases.
 */
export function enteredCommandName(argv: string[]): string | undefined {
  const userArgs = argv.slice(2);
  for (const a of userArgs) {
    if (a === '--') return undefined;
    if (!a.startsWith('-')) return a;
  }
  return undefined;
}

/**
 * Build the set of every command name + alias known to the static
 * `COMMAND_INDEX`, including all sub-command names. Used to short-circuit
 * the "unknown command" case before paying the bootstrap cost.
 */
export function buildKnownNameSet(index: { name: string; alias?: string; subCommands?: any[] }[]): Set<string> {
  const out = new Set<string>();
  const walk = (entries: any[]) => {
    for (const e of entries) {
      if (e?.name) out.add(String(e.name).split(' ')[0]);
      if (e?.alias) out.add(String(e.alias));
      if (Array.isArray(e?.subCommands)) walk(e.subCommands);
    }
  };
  walk(index);
  return out;
}
