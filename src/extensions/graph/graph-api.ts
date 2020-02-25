import { Graph } from 'cleargraph';
import { Component } from '../component';
import { Dependency } from './index';

export type insightType =
  | 'cyclicDependencies'
  | 'isCyclic'
  | 'duplicateDependencies'
  | 'depth'
  | 'totalDependencies'
  | 'all';
export type responseType = 'graph_array' | 'boolean' | 'number';
export type nodeId = string;
export type insight = {
  inisight: insightType;
  message: string;
  data: Array<Graph<Component, Dependency>>;
};

export interface commandObject {
  inisight: insightType;
  graph: Graph<Component, Dependency>;
  startingNode?: nodeId;
  depth?: number; // the max number of steps for traversal
}

export interface insightObject {
  insights: Array<insight>;
}
