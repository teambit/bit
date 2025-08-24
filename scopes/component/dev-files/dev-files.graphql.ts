import type { Component } from '@teambit/component';
import type { Schema } from '@teambit/graphql';
import { gql } from 'graphql-tag';

import type { DevFilesMain } from './dev-files.main.runtime';

export function devFilesSchema(devFilesMain: DevFilesMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        devFiles: [String!]
      }
    `,
    resolvers: {
      Component: {
        devFiles: async (component: Component) => {
          return devFilesMain.getDevFiles(component).list();
        },
      },
    },
  };
}
