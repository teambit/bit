import { Schema } from '@teambit/graphql';
import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';
import gql from 'graphql-tag';
import { flatten, slice } from 'lodash';

import { LanesMain } from './lanes.main.runtime';

export function lanesSchema(lanesMainRuntime: LanesMain): Schema {
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
        components(offset: Int, limit: Int): [Component!]!
        readmeComponent: Component
      }

      # Lane API
      type Lanes {
        id: String!
        list(ids: [String!], offset: Int, limit: Int): [Lane!]!
        diff(from: String!, to: String!, options: DiffOptions): GetDiffResult
        current: Lane
      }

      type Query {
        lanes: Lanes
      }
    `,
    resolvers: {
      Lanes: {
        // need this for Apollo InMemory Caching
        id: () => 'lanes',
        list: async (
          lanesMain: LanesMain,
          { ids, limit, offset }: { ids?: string[]; offset?: number; limit?: number }
        ) => {
          let lanes: LaneData[] = [];

          if (!ids || ids.length === 0) {
            lanes = await lanesMain.getLanes({});
          } else {
            lanes = flatten(await Promise.all(ids.map((id) => lanesMain.getLanes({ name: id }))));
          }

          if (limit || offset) {
            lanes = slice(lanes, offset, limit && limit + (offset || 0));
          }

          return lanes;
        },
        current: async (lanesMain: LanesMain) => {
          const currentLaneId = lanesMain.getCurrentLaneName();
          if (!currentLaneId) return undefined;
          const [currentLane] = await lanesMain.getLanes({ name: currentLaneId });
          return currentLane;
        },
        diff: async (
          lanesMain: LanesMain,
          { from, to, options }: { to: string; from: string; options: { color?: boolean } }
        ) => {
          const getDiffResults = await lanesMain.getDiff([from, to], options);
          return {
            ...getDiffResults,
            compsWithDiff: getDiffResults.compsWithDiff.map((item) => ({ ...item, id: item.id.toString() })),
          };
        },
      },
      Lane: {
        id: (lane: LaneData) => lane.name,
        isMerged: (lane: LaneData) => lane.isMerged,
        remote: (lane: LaneData) => lane.remote,
        components: async (lane: LaneData) => {
          const laneComponents = await lanesMainRuntime.getLaneComponentModels(lane);
          return laneComponents;
        },
        readmeComponent: async (lane: LaneData) => {
          const laneReadmeComponent = await lanesMainRuntime.getLaneReadmeComponent(lane);
          return laneReadmeComponent;
        },
      },
      Query: {
        lanes: () => lanesMainRuntime,
      },
    },
  };
}
