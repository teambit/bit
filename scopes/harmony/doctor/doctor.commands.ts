import type { CommandDescriptor, CommandOptions } from '@teambit/cli';

/**
 * Declarative command descriptors for this aspect.
 *
 * Part of the ESM Migration with Lazy-Loaded Aspects RFC
 * (docs/rfc-esm-lazy-aspects.md §6.2). Each descriptor is the single
 * source of truth for its command's static fields; the matching handler
 * class reads these fields rather than redeclaring them, and
 * `cli.register(descriptor, factory)` consumes the pair.
 */

export const doctorCommand: CommandDescriptor = {
  name: 'doctor [diagnosis-name]',
  alias: '',
  description: 'diagnose and troubleshoot workspace issues',
  extendedDescription: `runs comprehensive health checks on your workspace to detect and report configuration problems, 
  missing dependencies, corrupted data, and other issues that may affect workspace functionality.
  can generate diagnostic reports and workspace archives for debugging and support purposes.`,
  group: 'system',
  loadAspects: false,
  options: [
      ['j', 'json', 'return diagnoses in json format'],
      ['', 'list', 'list all available diagnoses'],
      ['s', 'save [filePath]', 'save diagnoses to a file'],
      [
        'a',
        'archive [filePath]',
        'archive the workspace including diagnosis info (by default exclude node-modules and include .bit)',
      ],
      ['n', 'include-node-modules', 'relevant for --archive. include node_modules in the archive file'],
      ['p', 'include-public', 'relevant for --archive. include public folder in the archive file'],
      ['e', 'exclude-local-scope', 'relevant for --archive. exclude .bit or .git/bit from the archive file'],
      ['r', 'remote <remoteName>', 'run doctor checks on a remote scope'],
    ] as CommandOptions,
};
