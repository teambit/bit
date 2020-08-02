import gql from 'graphql-tag';
import { Schema } from '../graphql';
import { Environments } from './environments.extension';
import { Component } from '../component';

export function environmentsSchema(environments: Environments): Schema {
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
