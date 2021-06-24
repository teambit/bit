import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';
import { LanesMain } from './lanes.main.runtime';

export function lanesSchema(lanesMain: LanesMain): Schema {
  return {
    typeDefs: gql`
      type CompLaneData {
        id: String!
        head: String!
      }

      type LanesData {
        name: String!
        components: [CompLaneData]
        isMerged: Boolean
      }

      type FileDiff {
        filePath: String!
        diffOutput: String
      }

      type FieldsDiff {
        fieldName: String!
        diffOutput: String
      }

      type DiffResults {
        id: String
        hasDiff: Boolean
        filesDiff: [FileDiff]
        fieldsDiff: [FieldsDiff]
      }

      type GetDiffResult {
        newComps: [String]
        compsWithNoChanges: [String]
        toLaneName: String
        compsWithDiff: [DiffResults]
      }

      type Lanes {
        getLanes: [LanesData]
        getCurrentLane: String
        getDiff(values: [String]): GetDiffResult
      }

      type Query {
        lanes: Lanes
      }
    `,
    resolvers: {
      Lanes: {
        getLanes: async (lanes: LanesMain) => {
          const lanesResults = await lanes.getLanes({});
          return lanesResults.map((lane) => ({
            name: lane.name,
            components: lane.components.map((c) => ({ id: c.id.toString(), head: c.head.toString() })),
            isMerged: Boolean(lane.isMerged),
          }));
        },
        getCurrentLane: (lanes: LanesMain) => {
          return lanes.getCurrentLane();
        },
        getDiff: async (lanes: LanesMain, { values }: { values: string[] }) => {
          const getDiffResults = await lanes.getDiff(values);
          return {
            ...getDiffResults,
            compsWithDiff: getDiffResults.compsWithDiff.map((item) => ({ ...item, id: item.id.toString() })),
          };
        },
      },
      Query: {
        lanes: () => lanesMain,
      },
    },
  };
}
