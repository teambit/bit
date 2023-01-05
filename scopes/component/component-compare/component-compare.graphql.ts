import gql from 'graphql-tag';
import { ComponentCompareMain, ComponentCompareResult } from './component-compare.main.runtime';

export function componentCompareSchema(componentCompareMain: ComponentCompareMain) {
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
        code(fileName: String): [FileCompareResult!]!
        aspects(aspectName: String): [FieldCompareResult!]!
      }

      extend type ComponentHost {
        compareComponent(baseId: String!, compareId: String!): ComponentCompareResult
      }
    `,
    resolvers: {
      ComponentHost: {
        compareComponent: async (_, { baseId, compareId }: { baseId: string; compareId: string }) => {
          return componentCompareMain.compare(baseId, compareId);
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
        aspects: (result: ComponentCompareResult, { fieldName }: { fieldName?: string }) => {
          if (fieldName) {
            return result.fields.filter((field) => field.fieldName === fieldName);
          }
          return result.fields;
        },
      },
    },
  };
}
