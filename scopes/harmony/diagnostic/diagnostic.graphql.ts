import type { Schema } from '@teambit/graphql';
import { gql } from 'graphql-tag';
import type { DiagnosticMain } from './diagnostic.main.runtime';

export class DiagnosticGraphql implements Schema {
  constructor(private diagnosticMain: DiagnosticMain) {}

  typeDefs = gql`
    scalar JSONObject

    type Query {
      _diagnostic: JSONObject
    }
  `;
  resolvers = {
    Query: {
      _diagnostic: () => {
        return this.diagnosticMain.getDiagnosticData();
      },
    },
  };
}
