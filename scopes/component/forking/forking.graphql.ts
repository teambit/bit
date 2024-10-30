import { Component } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import { gql } from 'graphql-tag';
import { ForkingMain } from './forking.main.runtime';

export function forkingSchema(forking: ForkingMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        forking: ForkingInfo
      }

      type ForkingInfo {
        forkedFrom: String
      }
    `,
    resolvers: {
      Component: {
        forking: (component: Component) => {
          const forkInfo = forking.getForkInfo(component);
          return {
            forkedFrom: forkInfo?.forkedFrom.toString(),
          };
        },
      },
    },
  };
}
