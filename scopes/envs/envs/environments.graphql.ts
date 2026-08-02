import type { Component } from '@teambit/component';
import type { Schema } from '@teambit/graphql';
import { gql } from 'graphql-tag';

import type { EnvsMain } from './environments.main.runtime';

/**
 * Per-Component-instance cache for the env descriptor. `getDescriptor` is called once per GraphQL
 * op that selects `Component.env { id icon }` — the lane-compare panel fires this for every visible
 * component (10× per response in our profile). The descriptor only depends on the component's
 * immutable aspect entries, so it's safe to cache for the lifetime of the underlying `Component`
 * instance (WeakMap auto-evicts when the scope's componentsCache drops it).
 *
 * `null` sentinel distinguishes "computed and got undefined" from "not yet computed".
 */
const envDescriptorCache = new WeakMap<Component, ReturnType<EnvsMain['getDescriptor']> | null>();

export function environmentsSchema(environments: EnvsMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        env: ExtensionDescriptor
      }

      type ExtensionDescriptor {
        id: String
        icon: String
      }
    `,
    resolvers: {
      Component: {
        env: (component: Component) => {
          if (envDescriptorCache.has(component)) {
            return envDescriptorCache.get(component) ?? undefined;
          }
          const descriptor = environments.getDescriptor(component);
          envDescriptorCache.set(component, descriptor ?? null);
          return descriptor;
        },
      },
    },
  };
}
