import gql from 'graphql-tag';
import { ComponentFactory } from '@teambit/component';
import { ComponentCompareMain } from './component-compare.main.runtime';

export function componentCompareSchema(componentCompareMain: ComponentCompareMain) {
  return {
    typeDefs: gql`
      type FileCompareResult {
        fileName: String!
        baseContent: String!
        compareContent: String!
      }

      type ComponentCompareResult {
        overview: FileCompareResult!
        composition(compositionName: String): [FileCompareResult!]!
        code(fileName: String): [FileCompareResult!]!
        dependencies
      }

      extend type ComponentHost {
        compareComponent(baseId: String!, compareId: String!): ComponentCompareResult
      }
    `,
    resolvers: {
      ComponentHost: {
        compareComponent: async (
          host: ComponentFactory,
          { baseId, compareId }: { baseId: string; compareId: string }
        ) => {},
      },
    },
  };
}
