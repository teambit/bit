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

export const graphCommand: CommandDescriptor = {
  name: 'graph [id]',
  alias: '',
  description: 'visualize component dependencies as a graph image',
  extendedDescription: `generates an SVG (or PNG) image showing component dependency relationships.
  black arrows represent runtime dependencies, red arrows show dev or peer dependencies.
  by default shows only workspace components; use --include-dependencies for full dependency tree.`,
  group: 'info-analysis',
  remoteOp: true,
  options: [
      ['r', 'remote [remoteName]', 'remote name (name is optional, leave empty when id is specified)'],
      [
        '',
        'layout <name>',
        'GraphVis layout. default to "dot". options are [circo, dot, fdp, neato, osage, patchwork, sfdp, twopi]',
      ],
      ['', 'png', 'save the graph as a png file instead of svg. requires "graphviz" to be installed'],
      ['', 'cycles', 'generate a graph of cycles only'],
      [
        '',
        'include-local-only',
        'DEPRECATED: include only the components in the workspace (or local scope). This is now the default behavior.',
      ],
      [
        '',
        'include-dependencies',
        'include all dependencies recursively, not just workspace (or local scope) components',
      ],
      ['j', 'json', 'json format'],
    ] as CommandOptions,
};
