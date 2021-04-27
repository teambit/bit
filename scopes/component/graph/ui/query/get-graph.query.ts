import { gql } from '@apollo/client';
import { EdgeType } from '@teambit/graph';

// please update types when updating query, for added safety

export const GET_GRAPH = gql`
  query graph($ids: [String], $filter: String) {
    graph(ids: $ids, filter: $filter) {
      nodes {
        id
        component {
          id {
            name
            version
            scope
          }
          displayName

          deprecation {
            isDeprecate
          }

          env {
            id
            icon
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

    displayName: string;

    deprecation: {
      isDeprecate: boolean;
    };

    env: {
      id: string;
      icon: string;
    };
  };
};

export type RawEdge = {
  sourceId: string;
  targetId: string;
  dependencyLifecycleType: EdgeType;
};
