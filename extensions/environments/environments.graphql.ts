import gql from 'graphql-tag';
import { Schema } from '@teambit/graphql';
import { EnvsMain } from './environments.main.runtime';
import { Component } from '@teambit/component';

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
