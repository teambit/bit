import { Component } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { TesterMain } from './tester.main.runtime';

export function testerSchema(tester: TesterMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        testsResults: TestsResults
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
      }

      type Errors {
        failureMessage: String
        file: String
      }
    `,
    resolvers: {
      Component: {
        testsResults: (component: Component) => {
          const testsResults = tester.getTestsResults(component);
          if (!testsResults) return null;
          return testsResults;
        },
      },
    },
  };
}
