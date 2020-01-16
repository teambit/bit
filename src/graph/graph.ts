import { Graph as GraphLib } from 'graphlib/lib';

export default class Graph {
  graph: GraphLib;
  constructor(directed: boolean = true, multigraph: boolean = true) {
    this.graph = new GraphLib({ directed: directed, multigraph: multigraph, compound: true });
  }

  setNode(key: string, value: any) {
    return this.graph.setNode(key, value);
  }

  node(key: string) {
    return this.graph.node(key);
  }

  nodes() {
    return this.graph.nodes();
  }

  hasNode(key: string) {
    return this.graph.hasNode(key);
  }

  removeNode(key: string) {
    return this.graph.removeNode(key);
  }

  nodeCount() {
    return this.graph.nodeCount();
  }

  setDefaultNodeLabel(label: string) {
    return this.setDefaultNodeLabel(label);
  }

  filterNodes(fu: Function) {
    //TODO
  }

  sources() {
    return this.graph.sources();
  }

  sinks() {
    return this.graph.sinks();
  }

  setEdge(sourceKey: string, tragetKey: string, labels: string[]) {
    return this.graph.setEdge(sourceKey, tragetKey, labels);
  }

  hasEdge(sourceKey: string, targetKey: string) {
    return this.graph.hasEdge(sourceKey, targetKey);
  }

  edge(sourceKey: string, targetKey: string) {
    return this.graph.edge(sourceKey, targetKey);
  }

  edges() {
    return this.graph.edges();
  }

  removeEdge(sourceKey: string, targetKey: string) {
    return this.graph.removeEdge(sourceKey, targetKey);
  }

  addEdgeLabel(labels: string | string[]) {
    //TODO
  }

  removeEdgeLabel(labels: string | string[]) {
    //TODO
  }

  edgeCount() {
    return this.graph.edgeCount();
  }

  setDefaultEdgeLabel(val: string) {
    return this.graph.setDefaultEdgeLabel();
  }

  inEdges(nodeKey: string) {
    return this.graph.inEdges(nodeKey);
  }

  outEdges(nodeKey: string) {
    return this.graph.outEdges(nodeKey);
  }

  nodeEdges(nodeKey: string) {
    return this.graph.nodeGraph(nodeKey);
  }

  predecessors(nodeKeys: string | string[], byEdgeLabels: string[] = [], returnNodeInfo: boolean = false) {
    //TODO
  }

  successors(nodeKeys: string | string[], byEdgeLabels: string[] = [], returnNodeInfo: boolean = false) {
    //TODO
  }

  neighbors(nodeKeys: string | string[], byEdgeLabels: string[] = [], returnNodeInfo: boolean = false) {
    //TODO
  }

  recursSuccessors(
    nodeKeys: string | string[],
    byEdgeLabels: string[] = [],
    returnNodeInfo: boolean = false,
    returnStructure: 'flatList' | 'subGraph' | 'layers' = 'flatList'
  ) {
    //TODO
  }

  recursPredecessors(
    nodeKeys: string | string[],
    byEdgeLabels: string[] = [],
    returnNodeInfo: boolean = false,
    returnStructure: 'flatList' | 'subGraph' | 'layers' = 'flatList'
  ) {
    //TODO
  }

  setGraphLabel(label: string) {
    return this.graph.setGraph(label);
  }

  getGraphLabel() {
    return this.graph.graph();
  }

  diff(graph: GraphLib) {
    //TODO
  }

  merge(graph: GraphLib) {
    //TODO
  }

  isDirected() {
    return this.graph.isDirected();
  }

  isMultigraph() {
    return this.graph, this.isMultigraph();
  }
}
