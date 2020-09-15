import { Component, ComponentFactory } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { TesterMain } from './tester.main.runtime';

export function testerSchema(tester: TesterMain): Schema {
  return {
    typeDefs: gql`
      extend type ComponentHost {
        getTests(id: String!): TestsResults
      }

      type TestsResults {
        tests: [Tests]
        errors: [Errors]
      }

      type Tests {
        ancestor: [String]
        name: String
        duration: String
        file: String
        status: String
        error: string
      }

      type Errors {
        failureMessage: String
        file: String
      }
    `,
    resolvers: {
      ComponentHost: {
        getTests: async (host: ComponentFactory, { id }: { id: string }) => {
          const componentId = await host.resolveComponentId(id);
          const component = await host.get(componentId);
          if (!component) return null;
          const testsResults = tester.getTestsResults(component);
          if (!testsResults) return null;
          return testsResults;
        },
      },
    },
  };
}
