import { ComponentFactory } from '@teambit/component';
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
        testsFiles: [TestsFiles]
      }

      type TestsFiles {
        file: String
        tests: [Tests]
        pass: Int
        failed: Int
        pending: Int
        duration: Int
        slow: Boolean
      }

      type Tests {
        ancestor: [String]
        name: String
        duration: String
        file: String
        status: String
        error: String
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
