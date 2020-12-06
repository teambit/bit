import { ComponentFactory } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { GraphBuilder } from './graph-builder';
import { ComponentGraph } from './component-graph';
import { GraphFilter } from './model/graph-filters';
import { DependencyType } from './model/dependency';
import { EdgeType } from './edge-type';

export function graphSchema(graphBuilder: GraphBuilder, componentsHost: ComponentFactory): Schema {
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
        graph: async (_parent, { ids, filter }: { ids?: string[]; filter?: GraphFilter }) => {
          const resolvedIds = ids
            ? await componentsHost.resolveMultipleComponentIds(ids)
            : (await componentsHost.list()).map((x) => x.id);

          const graph = await graphBuilder.getGraph(resolvedIds);
          if (!graph) return undefined;

          if (filter === 'runtimeOnly') {
            const runtimeGraph = graph.runtimeOnly(resolvedIds.map((x) => x.toString()));
            return runtimeGraph;
          }

          return graph;
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
