import gql from 'graphql-tag';
import { Schema } from '../graphql';
import { EnvsMain } from './environments.main.runtime';
import { Component } from '../component';

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
