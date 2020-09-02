import gql from 'graphql-tag';
import { LanesMain } from './lanes.main.runtime';

export function lanesSchema(lanesMain: LanesMain) {
  return {
    typeDefs: gql`
      type Lane {
        name: String!
        remote: String | null
        isMerged: Boolean
      }

      type Query {
        
      }
    `,
    resolvers: {
      list: () => {
        return lanesMain.list();
      },
    },
  };
}
