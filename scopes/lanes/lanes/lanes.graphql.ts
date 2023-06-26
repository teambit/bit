import { Schema } from '@teambit/graphql';
import { LaneId } from '@teambit/lane-id';
import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';
import gql from 'graphql-tag';
import { flatten, slice } from 'lodash';
import { LaneComponentDiffStatus, LaneDiffStatus, LaneDiffStatusOptions, LanesMain } from './lanes.main.runtime';

export function lanesSchema(lanesMainRuntime: LanesMain): Schema {
  return {
    typeDefs: gql`
      type FileDiff {
        filePath: String!
        diffOutput: String
      }

      type SnapDistance {
        onSource: [String!]!
        onTarget: [String!]!
        common: String
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

      input DiffStatusOptions {
        skipChanges: Boolean
        skipUpToDate: Boolean
      }

      type LaneId {
        name: String!
        scope: String!
      }

      type LaneComponentDiffStatus {
        """
        for apollo caching - component id
        """
        id: String!
        sourceHead: String!
        targetHead: String
        componentId: ComponentID!
        changeType: String @deprecated(reason: "Use changes")
        """
        list of all change types - Source Code, Dependency, Aspects, etc
        """
        changes: [String!]
        upToDate: Boolean
        snapsDistance: SnapDistance
        unrelated: Boolean
      }

      type LaneDiffStatus {
        """
        for apollo caching - source + target
        """
        id: String!
        source: LaneId!
        target: LaneId!
        componentsStatus: [LaneComponentDiffStatus!]!
      }

      type LaneOwner {
        name: String
        username: String
        displayName: String
        email: String
        profileImage: String
      }

      type Lane {
        id: LaneId!
        hash: String
        laneComponentIds: [ComponentID!]!
        components(offset: Int, limit: Int): [Component!]!
        readmeComponent: Component
        createdBy: LaneOwner
        createdAt: String
        updatedBy: LaneOwner
        updatedAt: String
      }

      input LaneSort {
        by: String
        direction: String
      }

      # Lane API
      type Lanes {
        id: String!
        list(ids: [String!], offset: Int, limit: Int, sort: LaneSort): [Lane!]!
        default: Lane
        diff(from: String!, to: String!, options: DiffOptions): GetDiffResult
        diffStatus(source: String!, target: String, options: DiffStatusOptions): LaneDiffStatus!
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
          {
            ids,
            limit,
            offset,
            sort: { by = 'createdAt', direction = 'desc' } = { by: 'createdAt', direction: 'desc' },
          }: {
            ids?: string[];
            offset?: number;
            limit?: number;
            sort?: {
              by?: string;
              direction?: string;
            };
          }
        ) => {
          let lanes: LaneData[] = [];

          if (!ids || ids.length === 0) {
            lanes = await lanesMain.getLanes({ showDefaultLane: true });
          } else {
            lanes = flatten(
              await Promise.all(
                ids.map((id) => {
                  if (id === lanesMain.getDefaultLaneId().name) {
                    return lanesMain.getLanes({ showDefaultLane: true, name: id });
                  }
                  return lanesMain.getLanes({ name: LaneId.parse(id).name });
                })
              )
            );
          }

          lanes = lanes.sort((a, b) => {
            switch (by) {
              default: {
                if (!a[by] || !b[by]) return 0;

                if (a[by] < b[by]) return direction === 'asc' ? -1 : 1;
                if (a[by] > b[by]) return direction === 'asc' ? -1 : 1;
                return 0;
              }
              case 'createdAt':
              case 'updatedAt': {
                const aDate = a.log?.date;
                const bDate = b.log?.date;

                if (!aDate || !bDate) return 0;

                if (+aDate < +bDate) return direction === 'asc' ? -1 : 1;
                if (+aDate > +bDate) return direction === 'asc' ? 1 : -1;
                return 0;
              }
              case 'id': {
                const aId = a[by].toString();
                const bId = b[by].toString();

                if (aId < bId) return direction === 'asc' ? -1 : 1;
                if (aId > bId) return direction === 'asc' ? -1 : 1;
                return 0;
              }
            }
          });

          if (limit || offset) {
            lanes = slice(lanes, offset, limit && limit + (offset || 0));
          }

          return lanes;
        },
        default: async (lanesMain: LanesMain) => {
          const [defaultLane] = await lanesMain.getLanes({
            showDefaultLane: true,
            name: lanesMain.getDefaultLaneId().name,
          });
          return defaultLane;
        },
        current: async (lanesMain: LanesMain) => {
          const currentLaneName = lanesMain.getCurrentLaneName();
          if (!currentLaneName) return undefined;
          const [currentLane] = await lanesMain.getLanes({ name: currentLaneName });
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
        diffStatus: async (
          lanesMain: LanesMain,
          { source, target, options }: { source: string; target?: string; options?: LaneDiffStatusOptions }
        ) => {
          const sourceLaneId = LaneId.parse(source);
          const targetLaneId = target ? LaneId.parse(target) : undefined;
          return lanesMain.diffStatus(sourceLaneId, targetLaneId, options);
        },
      },
      LaneDiffStatus: {
        id: (diffStatus: LaneDiffStatus) => `${diffStatus.source.toString()}-${diffStatus.target.toString()}`,
      },
      LaneComponentDiffStatus: {
        id: (diffCompStatus: LaneComponentDiffStatus) =>
          `${diffCompStatus.componentId.toStringWithoutVersion()}-${diffCompStatus.sourceHead}-${
            diffCompStatus.targetHead
          }`,
        componentId: (diffCompStatus: LaneComponentDiffStatus) => diffCompStatus.componentId.toObject(),
      },
      Lane: {
        id: (lane: LaneData) => lane.id.toObject(),
        laneComponentIds: async (lane: LaneData) => {
          const componentIds = await lanesMainRuntime.getLaneComponentIds(lane);
          return componentIds.map((componentId) => componentId.toObject());
        },
        components: async (lane: LaneData) => {
          const laneComponents = await lanesMainRuntime.getLaneComponentModels(lane);
          return laneComponents;
        },
        readmeComponent: async (lane: LaneData) => {
          const laneReadmeComponent = await lanesMainRuntime.getLaneReadmeComponent(lane);
          return laneReadmeComponent;
        },
        createdAt: async (lane: LaneData) => {
          return lane.log?.date;
        },
        createdBy: async (lane: LaneData) => {
          return {
            name: lane.log?.username,
            email: lane.log?.email,
            profileImage: lane.log?.profileImage,
            displayName: lane.log?.username,
            username: lane.log?.username,
          };
        },
      },
      Query: {
        lanes: () => lanesMainRuntime,
      },
    },
  };
}
