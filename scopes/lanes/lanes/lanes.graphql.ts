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

      input DiffOptions {
        color: Boolean
      }

      type Lanes {
        getLanes: [LanesData]
        getLaneByName(name: String): LanesData
        getCurrentLaneName: String
        getDiff(values: [String], options: DiffOptions): GetDiffResult
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
        getLaneByName: async (lanes: LanesMain, { name }: { name: string }) => {
          const lanesResults = await lanes.getLanes({ name });
          const laneResult = lanesResults[0];
          return {
            name: laneResult.name,
            components: laneResult.components.map((c) => ({ id: c.id.toString(), head: c.head.toString() })),
            isMerged: Boolean(laneResult.isMerged),
          };
        },
        getCurrentLaneName: (lanes: LanesMain) => {
          return lanes.getCurrentLane();
        },
        getDiff: async (lanes: LanesMain, { values, options }: { values: string[]; options: { color?: boolean } }) => {
          const getDiffResults = await lanes.getDiff(values, options);
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
