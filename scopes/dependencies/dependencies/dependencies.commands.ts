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

export const whyCommand: CommandDescriptor = {
  name: 'why <dependency-name>',
};

export const setPeerCommand: CommandDescriptor = {
  name: 'set-peer <component-id> <range>',
  alias: '',
  description: 'configure component to always be installed as peer dependency',
  extendedDescription: `marks a component to always be treated as a peer dependency when used by other components.
  useful for shared libraries that should be provided by the consuming application.
  the specified version range will be used when adding this component as a peer dependency.`,
  group: 'dependencies',
  arguments: [
      { name: 'component-id', description: 'the component to set as always peer' },
      {
        name: 'range',
        description: 'the default range to use for the component, when added to peerDependencies',
      },
    ],
  options: [] as CommandOptions,
};

export const unsetPeerCommand: CommandDescriptor = {
  name: 'unset-peer <component-id>',
  alias: '',
  description: 'remove always-peer configuration from component',
  extendedDescription: `removes the always-peer marking from a component, allowing it to be installed as a regular dependency.
  reverses the effect of 'bit set-peer' command. the component will be treated normally in dependency resolution.`,
  group: 'dependencies',
  arguments: [{ name: 'component-id', description: 'the component to unset as always peer' }],
  options: [] as CommandOptions,
};

export const dependentsCommand: CommandDescriptor = {
  name: 'dependents <component-name>',
  alias: '',
  description: 'show components that depend on the specified component',
  extendedDescription: `displays components from both workspace and scope that depend on the specified component.
  useful for understanding impact before making changes to a component or when planning refactoring.
  shows both direct and transitive dependents organized by their origin (workspace vs scope).`,
  helpUrl: 'reference/dependencies/inspecting-dependencies#review-dependents',
  group: 'dependencies',
  arguments: [
      {
        name: 'component-name',
        description: 'component name or component id',
      },
    ],
  options: [['j', 'json', 'return the dependents in JSON format']] as CommandOptions,
};
