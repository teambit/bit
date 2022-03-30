import { Schema } from '@teambit/graphql';
import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';
import gql from 'graphql-tag';
import { LanesMain } from './lanes.main.runtime';

export function lanesSchema(lanesMain: LanesMain): Schema {
  return {
    typeDefs: gql`
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

      type Lane {
        id: String!
        isMerged: Boolean
        remote: String
        components: [Component!]!
        currentLane: Lane
        diff(toLaneId: String!, options: DiffOptions): GetDiffResult
      }

      type Query {
        lanes(id: String): [Lane!]!
      }
    `,
    resolvers: {
      Lane: {
        id: (lane: LaneData) => lane.name,
        isMerged: (lane: LaneData) => lane.isMerged,
        remote: (lane: LaneData) => lane.remote,
        currentLane: async () => {
          const currentLaneId = lanesMain.getCurrentLane();
          if (!currentLaneId) return undefined;
          const [currentLane] = await lanesMain.getLanes({ name: currentLaneId });
          return currentLane;
        },
        components: async (lane: LaneData) => {
          const laneComponents = await lanesMain.getLaneComponentModels(lane.name);
          return laneComponents;
        },
        diff: async (fromLane: LaneData, { toLaneId, options }: { toLaneId: string; options: { color?: boolean } }) => {
          const getDiffResults = await lanesMain.getDiff([fromLane.name, toLaneId], options);
          return {
            ...getDiffResults,
            compsWithDiff: getDiffResults.compsWithDiff.map((item) => ({ ...item, id: item.id.toString() })),
          };
        },
      },
      Query: {
        lanes: async (_, { id }: { id?: string }) => {
          const lanes = await lanesMain.getLanes({ name: id });
          return lanes;
        },
      },
    },
  };
}
