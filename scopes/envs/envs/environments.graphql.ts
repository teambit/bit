import { Component } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { EnvsMain } from './environments.main.runtime';

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
          return environments.getDescriptor(component);
        },
      },
    },
  };
}
