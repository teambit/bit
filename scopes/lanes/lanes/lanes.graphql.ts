import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';
import { LanesMain } from './lanes.main.runtime';

export function lanesSchema(lanes: LanesMain): Schema {
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

      type Lanes {
        getLanes: [LanesData]
        getCurrentLane: String
      }

      type Query {
        lanes: Lanes
      }
    `,
    resolvers: {
      Lanes: {
        getLanes: async () => {
          const lanesResults = await lanes.getLanes({});
          return lanesResults.map((lane) => ({
            name: lane.name,
            components: lane.components.map((c) => ({ id: c.id.toString(), head: c.head.toString() })),
            isMerged: Boolean(lane.isMerged),
          }));
        },
        getCurrentLane: () => {
          return lanes.getCurrentLane();
        },
      },
      Query: {
        lanes: () => lanes,
      },
    },
  };
}
