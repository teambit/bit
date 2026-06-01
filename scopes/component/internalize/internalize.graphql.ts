import type { Component } from '@teambit/component';
import type { Schema } from '@teambit/graphql';
import { gql } from 'graphql-tag';

import type { InternalizeMain } from './internalize.main.runtime';

export function internalizeSchema(internalize: InternalizeMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        internal: InternalInfo
      }

      type InternalInfo {
        isInternal: Boolean
      }
    `,
    resolvers: {
      Component: {
        internal: (component: Component) => {
          return internalize.getInternalInfo(component);
        },
      },
    },
  };
}
