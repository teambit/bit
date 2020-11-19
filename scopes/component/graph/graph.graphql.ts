import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { GraphBuilder } from './graph-builder';
import { ComponentGraph } from './component-graph';
import { DependencyType } from './dependency';
import { EdgeType } from './edge-type';
import { filters } from './graph-filters';

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
        graph(ids: [String], filter: String): ComponentGraph
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
              dependencyLifecycleType: getDependencyLifecycleType(edge.edge.type),
            };
          });
        },
      },
      Query: {
        graph: (_parent, { ids, filter }: { ids: string[]; filter?: keyof typeof filters }) => {
          const relevantFilter = filter && filters[filter];
          return graphBuilder.getGraph(ids, relevantFilter);
        },
      },
    },
  };
}

function getDependencyLifecycleType(edgeRawData: DependencyType): EdgeType {
  if (edgeRawData === 'dev') return EdgeType.dev;
  if (edgeRawData === 'runtime') return EdgeType.runtime;
  return EdgeType.peer;
}
