import gql from 'graphql-tag';
import { LanesMain } from './lanes.main.runtime';

export function lanesSchema(lanesMain: LanesMain) {
  return {
    typeDefs: gql`
      # type Query {

      # }
    `,
    resolvers: {},
  };
}
