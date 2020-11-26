import { ComponentFactory } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { GraphBuilder } from './graph-builder';
import { ComponentGraph, filters, FilterType } from './component-graph';
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
        graph: async (_parent, { ids, filter }: { ids?: string[]; filter?: FilterType }) => {
          const resolvedIds = ids
            ? await componentsHost.resolveMultipleComponentIds(ids)
            : (await componentsHost.list()).map((x) => x.id);

          let graph = await graphBuilder.getGraph(resolvedIds);
          if (!graph) return undefined;

          const relevantFilter = filter && filters[filter];
          if (relevantFilter) {
            graph = graph.successorsSubgraph(
              resolvedIds.map((x) => x.toString()),
              relevantFilter
            );
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
