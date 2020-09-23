import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { GraphBuilder } from './graph-builder';
import { ComponentGraph } from './component-graph';
import { DependencyType } from './dependency';

export function graphSchema(graphBuilder: GraphBuilder): Schema {
  return {
    typeDefs: gql`
      type ComponentGraph {
        nodes: [ComponentGraphNode]
        edges: [ComponentGraphEdge]
      }

      type ComponentGraphNode {
        id: String
        component: Component
      }

      enum DependencyLifecycleType {
        PEER
        RUNTIME
        DEV
      }

      type ComponentGraphEdge {
        sourceId: String
        targetId: String
        dependencyLifecycleType: DependencyLifecycleType
      }

      extend type Query {
        graph(ids: [String]): ComponentGraph
      }
    `,
    resolvers: {
      ComponentGraph: {
        nodes: (graph: ComponentGraph) => {
          return Array.from(graph.nodes).map(([nodeId, component]) => {
            return {
              id: nodeId,
              component,
            };
          });
        },
        edges: (graph: ComponentGraph) => {
          // TODO: this is a hack since I don't have a proper way to get the edge with the source and target id from cleargraph
          // it should be change once cleargraph provide this
          const graphJson = graph.toJson();
          return graphJson.edges.map((edge) => {
            return {
              sourceId: edge.sourceId,
              targetId: edge.targetId,
              dependencyLifecycleType: getDependencyLifecycleType(edge.edge),
            };
          });
        },
      },
      Query: {
        graph: (_parent, { ids }: { ids: string[] }) => graphBuilder.getGraph(ids),
      },
    },
  };
}

function getDependencyLifecycleType(edgeRawData: DependencyType): string {
  if (edgeRawData === 'dev') return 'DEV';
  if (edgeRawData === 'runtime') return 'RUNTIME';
  return 'PEER';
}
