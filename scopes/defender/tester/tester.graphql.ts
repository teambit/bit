import type { GraphqlMain, Schema } from '@teambit/graphql';
import type { ComponentFactory } from '@teambit/component';
import { withFilter } from 'graphql-subscriptions';
import { ComponentID } from '@teambit/component-id';
import { gql } from 'graphql-tag';

import type { TesterMain } from './tester.main.runtime';
import { OnTestsChanged } from './tester.service';

export function testerSchema(tester: TesterMain, graphql: GraphqlMain): Schema {
  return {
    typeDefs: gql`
      extend type ComponentHost {
        getTests(id: String!): Tests
      }

      type Subscription {
        testsChanged(id: String!): Tests
      }

      type Tests {
        loading: Boolean!
        testsResults: TestsResults
      }

      type TestsChanged {
        testsResults: TestsResults
      }

      type TestsResults {
        testFiles: [TestFiles]
        success: Boolean
        start: Int
        coverage: CoverageResult
      }

      type TestFiles {
        file: String
        tests: [Tests]
        pass: Int
        failed: Int
        pending: Int
        duration: Int
        slow: Boolean
        errorStr: String
      }

      type Tests {
        ancestor: [String]
        name: String
        duration: String
        status: String
        error: String
      }

      type CoverageResult {
        files: [FileCoverage!]
        total: CoverageData!
      }

      type CoverageDetails {
        total: Int!
        covered: Int!
        skipped: Int!
        pct: Float!
      }

      type CoverageData {
        lines: CoverageDetails!
        functions: CoverageDetails!
        statements: CoverageDetails!
        branches: CoverageDetails!
      }

      type FileCoverage {
        path: String!
        data: CoverageData!
      }
    `,
    resolvers: {
      Subscription: {
        testsChanged: {
          subscribe: withFilter(
            () => graphql.pubsub.asyncIterator(OnTestsChanged),
            (payload, variables) => {
              return payload.testsChanged.id === variables.id;
            }
          ),
        },
      },

      ComponentHost: {
        getTests: async (host: ComponentFactory, { id }: { id: string }) => {
          const componentId = await host.resolveComponentId(id);
          const idHasVersion = ComponentID.fromString(id).hasVersion();
          const component = await host.get(componentId);
          if (!component) return null;
          const testsData = await tester.getTestsResults(component, idHasVersion);
          if (!testsData) return null;
          return {
            ...testsData,
            testsResults: {
              ...testsData.testsResults,
              testFiles: testsData.testsResults?.testFiles.map((testFile) => {
                return {
                  ...testFile,
                  duration: testFile.duration?.toFixed(0),
                  tests: testFile.tests.map((test) => {
                    return {
                      ...test,
                      duration: test.duration?.toFixed(0),
                    };
                  }),
                };
              }),
            },
          };
        },
      },
    },
  };
}
