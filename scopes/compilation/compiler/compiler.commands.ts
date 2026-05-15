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

export const compileCommand: CommandDescriptor = {
  name: 'compile [component-names...]',
  alias: '',
  description: 'transpile component source files',
  extendedDescription: `compiles TypeScript, JSX, and other source files into JavaScript using the compiler configured by each component's environment.
  outputs compiled files to node_modules/component-package-name/dist for consumption by other components.
  automatically triggered by "bit watch", "bit start", or IDE extensions, but can be run manually for debugging.`,
  helpUrl: 'reference/compiling/compiler-overview',
  group: 'component-development',
  arguments: [
      {
        name: 'component-names...',
        description: 'a list of component names or component IDs (defaults to all components)',
      },
    ],
  loader: true,
  options: [
      ['c', 'changed', 'compile only new and modified components'],
      ['v', 'verbose', 'show more data, such as, dist paths'],
      ['j', 'json', 'return the compile results in json format'],
      ['d', 'delete-dist-dir', 'delete existing dist folder before writing new compiled files'],
      ['', 'generate-types', 'EXPERIMENTAL. generate d.ts files for typescript components (hurts performance)'],
    ] as CommandOptions,
};
