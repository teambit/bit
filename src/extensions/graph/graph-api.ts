import { Graph } from 'cleargraph';
import { Component } from '../component';
import { Dependency } from './index';

export type insightName =
  | 'cyclicDependencies'
  | 'isCyclic'
  | 'duplicateDependencies'
  | 'depth'
  | 'totalDependencies'
  | 'all';
export type responseType = 'graph_array' | 'boolean' | 'number' | 'string';
export type nodeId = string;
export type insight = {
  inisight: insightName;
  message: string;
  data: Array<Graph<Component, Dependency>>;
};

export interface command {
  inisight: insightName;
  graph: Graph<Component, Dependency>;
  startingNode?: nodeId;
  depth?: number; // the max number of steps for traversal
}

export interface insights {
  data: Array<insight>;
}
