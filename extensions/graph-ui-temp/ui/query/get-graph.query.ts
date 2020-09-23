import { gql } from 'apollo-boost';

// please update types when updating query, for added safety

export const GET_GRAPH = gql`
  query graph($ids: [String]) {
    graph(ids: $ids) {
      nodes {
        id
        component {
          id {
            name
            version
            scope
          }
        }
      }
      edges {
        sourceId
        targetId
        dependencyLifecycleType
      }
    }
  }
`;

export type RawGraphQuery = {
  graph: RawGraph;
};

export type RawGraph = {
  nodes: RawNode[];
  edges: [];
};

export type RawNode = {
  id: string;
  component: {
    id: {
      name: string;
      scope: string;
      version: string;
    };
  };
};

export type RawEdge = {
  sourceId: string;
  targetId: string;
  dependencyLifecycleType: string;
};
