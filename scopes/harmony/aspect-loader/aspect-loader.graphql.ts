import type { Schema } from '@teambit/graphql';
import { gql } from 'graphql-tag';

import type { AspectLoaderMain } from './aspect-loader.main.runtime';

export function aspectLoaderSchema(aspectLoaderMain: AspectLoaderMain): Schema {
  return {
    typeDefs: gql`
      scalar JSONObject

      type Query {
        coreAspects: JSONObject
      }
    `,
    resolvers: {
      Query: {
        coreAspects: async () => {
          return aspectLoaderMain.getCoreAspectsPackagesAndIds();
        },
      },
    },
  };
}
