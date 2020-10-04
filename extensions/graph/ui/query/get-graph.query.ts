import { gql } from 'apollo-boost';
import { EdgeType } from '@teambit/graph';

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
          displayName

          deprecation {
            isDeprecate
          }

          status {
            isNew
            isInScope
            isStaged
            modifyInfo {
              hasModifiedFiles
              hasModifiedDependencies
            }
            isDeleted
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

    status: {
      isNew: boolean;
      isInScope: boolean;
      isStaged: boolean;
      modifyInfo?: {
        hasModifiedFiles: boolean;
        hasModifiedDependencies: boolean;
      };
      isDeleted: boolean;
    };

    env: {
      id: string;
      icon: string;
    };

    // un-fetched values values:
    // version: string;
    // server: {
    //   env: string;
    //   url: string;
    // };
    // packageName: string;
    // issuesCount: number;
  };
};

export type RawEdge = {
  sourceId: string;
  targetId: string;
  dependencyLifecycleType: EdgeType;
};
