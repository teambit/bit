import { GraphqlMain, Schema } from '@teambit/graphql';
import { ComponentFactory } from '@teambit/component';
import { withFilter } from 'graphql-subscriptions';
import { BitId } from '@teambit/legacy/dist/bit-id';
import gql from 'graphql-tag';

import { TesterMain } from './tester.main.runtime';
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
          const idHasVersion = BitId.parse(id).hasVersion();
          const component = await host.get(componentId);
          if (!component) return null;
          const testsResults = await tester.getTestsResults(component, idHasVersion);
          if (!testsResults) return null;
          return testsResults;
        },
      },
    },
  };
}
