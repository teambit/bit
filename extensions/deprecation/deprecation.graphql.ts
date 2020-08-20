import gql from 'graphql-tag';
import { Schema } from '@teambit/graphql';
import { Component } from '@teambit/component';
import { DeprecationMain } from './deprecation.main.runtime';

export function deprecationSchema(deprecation: DeprecationMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        deprecation: DeprecationInfo
      }

      type DeprecationInfo {
        isDeprecate: Boolean
      }
    `,
    resolvers: {
      Component: {
        deprecation: (component: Component) => {
          return deprecation.getDeprecationInfo(component);
        },
      },
    },
  };
}
