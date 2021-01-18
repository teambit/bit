import { ComponentMain } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { GraphBuilder } from './graph-builder';
import { ComponentGraph } from './component-graph';
import { GraphFilter } from './model/graph-filters';
import { DependencyType } from './model/dependency';
import { EdgeType } from './edge-type';

const textCmp = new Intl.Collator().compare;

export function graphSchema(graphBuilder: GraphBuilder, componentAspect: ComponentMain): Schema {
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
          return graph.nodes
            .map((node) => {
              return {
                id: node.id,
                component: node.attr,
              };
            })
            .sort((a, b) => textCmp(a.id, b.id));
        },
        edges: (graph: ComponentGraph) => {
          return graph.edges
            .map(
              (edge) =>
                ({
                  sourceId: edge.sourceId,
                  targetId: edge.targetId,
                  dependencyLifecycleType: getDependencyLifecycleType(edge.attr.type),
                } as { sourceId: string; targetId: string; dependencyLifecycleType: EdgeType })
            )
            .sort((a, b) => textCmp(a.sourceId, b.sourceId))
            .sort((a, b) => textCmp(a.targetId, b.targetId));
        },
      },
      Query: {
        graph: async (_parent, { ids, filter }: { ids?: string[]; filter?: GraphFilter }) => {
          const componentsHost = componentAspect.getHost();
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
