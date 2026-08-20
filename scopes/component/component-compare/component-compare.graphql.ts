import { gql } from 'graphql-tag';
import type { Schema } from '@teambit/graphql';
import type { ComponentCompareMain, ComponentCompareResult } from './component-compare.main.runtime';

export function componentCompareSchema(componentCompareMain: ComponentCompareMain): Schema {
  return {
    typeDefs: gql`
      type FileCompareResult {
        fileName: String!
        baseContent: String!
        compareContent: String!
        status: String
        diffOutput: String
      }

      type FieldCompareResult {
        fieldName: String!
        diffOutput: String
      }

      type ComponentCompareResult {
        # unique id for graphql - baseId + compareId
        id: String!
        baseId: String!
        compareId: String!
        code(fileName: String): [FileCompareResult!]!
        aspects(aspectName: String): [FieldCompareResult!]!
        tests(fileName: String): [FileCompareResult!]
        api: APIDiffResult
      }

      input ComponentComparePair {
        baseId: String!
        compareId: String!
      }

      extend type ComponentHost {
        compareComponent(baseId: String!, compareId: String!): ComponentCompareResult
        # bulk compare a paginated slice of pairs; an element is null if that pair failed to compare
        compareComponents(pairs: [ComponentComparePair!]!, offset: Int, limit: Int): [ComponentCompareResult]!
        # bulk api-diff a paginated slice of pairs; an element is null if that pair's diff couldn't be computed
        apiDiffs(pairs: [ComponentComparePair!]!, offset: Int, limit: Int): [APIDiffResult]!
      }
    `,
    resolvers: {
      ComponentHost: {
        compareComponent: async (_, { baseId, compareId }: { baseId: string; compareId: string }) => {
          return componentCompareMain.compare(baseId, compareId);
        },
        compareComponents: async (
          _,
          {
            pairs,
            offset,
            limit,
          }: { pairs: Array<{ baseId: string; compareId: string }>; offset?: number; limit?: number }
        ) => {
          return componentCompareMain.compareComponents(pairs, { offset, limit });
        },
        apiDiffs: async (
          _,
          {
            pairs,
            offset,
            limit,
          }: { pairs: Array<{ baseId: string; compareId: string }>; offset?: number; limit?: number }
        ) => {
          // each element is the plain record `getAPIDiff` returns (or null); the APIDiffResult
          // fields resolve from it via graphql's default field resolvers, same as the single
          // `apiDiff` resolver in @teambit/semantics.schema.
          return componentCompareMain.apiDiffs(pairs, { offset, limit });
        },
      },
      ComponentCompareResult: {
        id: (result: ComponentCompareResult) => result.id,
        code: (result: ComponentCompareResult, { fileName }: { fileName?: string }) => {
          if (fileName) {
            return result.code
              .filter((codeFile) => codeFile.filePath === fileName)
              .map((c) => ({ ...c, fileName: c.filePath, baseContent: c.fromContent, compareContent: c.toContent }));
          }

          return result.code.map((c) => ({
            ...c,
            fileName: c.filePath,
            baseContent: c.fromContent,
            compareContent: c.toContent,
          }));
        },
        tests: (result: ComponentCompareResult, { fileName }: { fileName?: string }) => {
          if (fileName) {
            return result.tests
              .filter((testFile) => testFile.filePath === fileName)
              .map((c) => ({ ...c, fileName: c.filePath, baseContent: c.fromContent, compareContent: c.toContent }));
          }

          return result.tests.map((c) => ({
            ...c,
            fileName: c.filePath,
            baseContent: c.fromContent,
            compareContent: c.toContent,
          }));
        },
        aspects: (result: ComponentCompareResult, { fieldName }: { fieldName?: string }) => {
          if (fieldName) {
            return result.fields.filter((field) => field.fieldName === fieldName);
          }
          return result.fields;
        },
        api: async (result: ComponentCompareResult) => {
          return (await componentCompareMain.getAPIDiff(result.baseId, result.compareId)) ?? null;
        },
      },
    },
  };
}
