import gql from 'graphql-tag';
import { Schema } from '../graphql';
import { DdeprecationExtension } from './deprecation.extension';
import { Component } from '../component';

export function deprecationSchema(deprecation: DdeprecationExtension): Schema {
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
