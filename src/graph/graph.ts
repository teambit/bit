import _ from 'lodash';
import { Graph as GraphLib } from 'graphlib/lib';
import { isAcyclic } from 'graphlib/lib/alg';

// TODO: This was copied here temporary since it's not yet available to be consumed via bit/npm
// TODO: you should not use it from here. please remove this file once it's available from a correct source

/**
 * Graph is an abstract graph class using a Graphlib intance and extending Graphlib's functionality.
 * The nodes and edges in the graph are represented by key-value pairs where the keys are strings,
 * and the generics N and E represent the node value and edge value respectively.
 */
export class Graph<N, E> {
  graph: GraphLib;
  /**
   * When instantiating the graph, specify the values of N and E, and decide on the type of connections
   * between the nodes using the 'directed' and 'multigraph' params.
   * @example
   * type NodeData = { bitId: string, version: string}
   * type EdgeData = { depType: 'peer' | 'dev' | 'regular', semDist?: 1 | 2 | 3 }
   * let g = new Graph<NodeData, EdgeData>()
   */
  constructor(
    directed = true,
    multigraph = true,
    readonly initialNodes?: Node<N>[],
    readonly initialEdges?: Edge<E>[]
  ) {
    this.graph = new GraphLib({ directed: directed, multigraph: multigraph, compound: true });
    this.graph.setDefaultEdgeLabel({});
    if (initialNodes) {
      initialNodes.forEach(node => this.setNode(node.key, node.value));
    }
    if (initialEdges) {
      initialEdges.forEach(edge => this.setEdge(edge.sourceKey, edge.targetKey, edge.data));
    }
  }

  /**
   * Creates or updates the key-value for a single node in the graph.
   * @example
   * g.setNode("my-id", "my-label");
   */
  setNode(key: string, value: N) {
    return this.graph.setNode(key, value);
  }

  setNodes(nodes: Node<N>[]) {
    nodes.forEach(node => this.setNode(node.key, node.value));
  }

  /**
   * Returns the value of the specified node key if it is in the graph.
   * Otherwise returns undefined.
   * @example
   * g.setNode("my-id", "my-label");
   * g.node("my-id");
   * // "my-label"
   */
  node(key: string): N {
    return this.graph.node(key);
  }

  /**
   * Gets a node key or keys and returns an object with their keys and values
   * @example
   * g.setNode("id1", "label1");
   * g.setNode("id2", "label2");
   * g.getNodeInfo(["id1", "id2"]);
   * // {"id1": "label1", "id2": "label2"}
   */
  getNodeInfo(nodeKeys: string | string[]): Record<string, N> {
    if (typeof nodeKeys === 'string') {
      return { [nodeKeys]: this.graph.node(nodeKeys) };
    }
    let graphObj: Record<string, N> = {};
    nodeKeys.forEach(node => {
      graphObj[node] = this.graph.node(node);
    });
    return graphObj;
  }

  /**
   * Returns an array of all node keys in the graph.
   * If a filter function is provided - returns only the nodes that the function returns truthy for.
   * @example
   * g.setNode("id1", "label1");
   * g.setNode("id2", "label2");
   * g.nodes();
   * // ["id1", "id2"]
   */
  nodes(filterPredicate?: (data: N) => boolean): string[] {
    if (typeof filterPredicate === 'undefined') {
      return this.graph.nodes();
    }
    let nodesToReturn: string[] = [];
    this.graph.nodes().forEach(node => {
      let nodeData = this.graph.node(node);
      if (filterPredicate(nodeData)) {
        nodesToReturn.push(node);
      }
    });
    return nodesToReturn;
  }

  /**
   * Returns true if the graph has a node with the given key.
   * @example
   * g.setNode("id1", "label1");
   * g.setNode("id2", "label2");
   * g.hasNode("id3");
   * // false
   */
  hasNode(key: string): boolean {
    return this.graph.hasNode(key);
  }

  /**
   * Removes the node with the id v in the graph or do nothing if the node is not in the graph.
   * If the node was removed this function also removes any incident edges.
   * Returns the graph, allowing this to be chained with other functions.
   * @example
   * g.setNode("id1", "label1");
   * g.removeNode("id1");
   */
  removeNode(key: string) {
    return this.graph.removeNode(key);
  }

  /**
   * Returns the number of nodes in the graph.
   * If a filter function is provided - returns only the number of nodes the function returns truthy for.
   * @example
   * g.setNode("id1", "label1");
   * g.nodeCount();
   * // 1
   */
  nodeCount(filterPredicate?: (data: N) => boolean): number {
    if (typeof filterPredicate === 'undefined') {
      return this.graph.nodeCount();
    }
    return this.nodes(filterPredicate).length;
  }

  /**
   * Returns those nodes in the graph that have no in-edges.
   * If a filter function is provided - returns only the nodes the function returns truthy for.
   */
  sources(filterPredicate: (data: N) => boolean = returnTrue): string[] {
    if (typeof filterPredicate === 'undefined') {
      return this.graph.sources();
    }
    let nodesToReturn: string[] = [];
    this.graph.sources().forEach(node => {
      let nodeData = this.graph.node(node);
      if (filterPredicate(nodeData)) {
        nodesToReturn.push(node);
      }
    });
    return nodesToReturn;
  }

  /**
   * Returns those nodes in the graph that have no out-edges.
   * If a filter function is provided - returns only the nodes the function returns truthy for.
   */
  sinks(filterPredicate: (data: N) => boolean = returnTrue): string[] {
    if (typeof filterPredicate === 'undefined') {
      return this.graph.sinks();
    }
    let nodesToReturn: string[] = [];
    this.graph.sinks().forEach(node => {
      let nodeData = this.graph.node(node);
      if (filterPredicate(nodeData)) {
        nodesToReturn.push(node);
      }
    });
    return nodesToReturn;
  }

  /**
   * Creates or updates the edge value for the edge key (sourceKey, targetKey) with the data provided.
   * Returns the graph, allowing this to be chained with other functions.
   * @example
   * g.setEdge("source", "target", {depType:"dev"});
   * g.edge("source", "target");
   * // returns {depType:"dev"}
   */
  setEdge<T>(sourceKey: string, tragetKey: string, data: T) {
    return this.graph.setEdge(sourceKey, tragetKey, data);
  }

  setEdges(edges: Edge<E>[]) {
    edges.forEach(edge => this.setEdge(edge.sourceKey, edge.targetKey, edge.data));
  }

  /**
   * Returns true if the graph has an edge between source and target.
   * @example
   * g.setEdge("source1", "target1", {depType:"dev"});
   * g.hasEdge("source1", "target1");
   * // true
   */
  hasEdge(sourceKey: string, targetKey: string): boolean {
    return this.graph.hasEdge(sourceKey, targetKey);
  }

  /**
   * Returns the data for the given source and target edge keys.
   * Returned undefined if there is no such edge in the graph.
   * @example
   * g.setEdge("source1", "target1", {depType:"dev"});
   * g.edge("source1", "target1");
   * // returns {depType:"dev"}
   */
  edge(sourceKey: string, targetKey: string) {
    return this.graph.edge(sourceKey, targetKey);
  }

  /**
   * Returns an array of all edge keys objects in the graph, where v is the source and w is the target.
   * If a filter function is provided - returns only the edges that the function returns truthy for.
   * @example
   * g.setEdge("a", "b", {depType:"dev"});
   * g.setEdge("b", "c", {depType:"peer"});
   * g.edges();
   * // returns [{"v":"a","w":"b"},
   *             {"v":"b","w":"c"}]
   */
  edges(filterPredicate?: (data: E) => boolean) {
    if (typeof filterPredicate === 'undefined') {
      return this.graph.edges();
    }
    const edges = this.graph.edges();
    let edgesToReturn: string[] = [];
    edges.forEach(edge => {
      let edgeData = this.graph.edge(edge.v, edge.w);
      if (filterPredicate(edgeData)) {
        edgesToReturn.push(edge);
      }
    });
    return edgesToReturn;
  }

  removeEdge(sourceKey: string, targetKey: string) {
    return this.graph.removeEdge(sourceKey, targetKey);
  }

  edgeCount(filterPredicate?: (data: E) => boolean): number {
    if (typeof filterPredicate === 'undefined') {
      return this.graph.edgeCount();
    }
    return this.edges(filterPredicate).length;
  }

  inEdges(nodeKey: string, filterPredicate?: (data: E) => boolean) {
    if (typeof filterPredicate === 'undefined') {
      return this.graph.inEdges(nodeKey);
    }
    const inEdges = this.graph.inEdges(nodeKey);
    let edgesToReturn: string[] = [];
    inEdges.forEach(edge => {
      let edgeData = this.graph.edge(edge.v, edge.w);
      if (filterPredicate(edgeData)) {
        edgesToReturn.push(edge);
      }
    });
    return edgesToReturn;
  }

  outEdges(nodeKey: string, filterPredicate?: (data: E) => boolean) {
    if (typeof filterPredicate === 'undefined') {
      return this.graph.outEdges(nodeKey);
    }
    const outEdges = this.graph.outEdges(nodeKey);
    let edgesToReturn: string[] = [];
    outEdges.forEach(edge => {
      let edgeData = this.graph.edge(edge.v, edge.w);
      if (filterPredicate(edgeData)) {
        edgesToReturn.push(edge);
      }
    });
    return edgesToReturn;
  }

  nodeEdges(nodeKey: string, filterPredicate?: (data: E) => boolean) {
    if (typeof filterPredicate === 'undefined') {
      return this.graph.nodeEdges(nodeKey);
    }
    const nodeEdges = this.graph.nodeEdges(nodeKey);
    let edgesToReturn: string[] = [];
    nodeEdges.forEach(edge => {
      let edgeData = this.graph.edge(edge.v, edge.w);
      if (filterPredicate(edgeData)) {
        edgesToReturn.push(edge);
      }
    });
    return edgesToReturn;
  }

  predecessors(nodeKey: string, filterPredicate: (data: E) => boolean = returnTrue) {
    let nodesToReturn: string[] = [];
    const inEdges = this.graph.inEdges(nodeKey);
    inEdges.forEach(edge => {
      let edgeData = this.graph.edge(edge.v, edge.w);
      if (filterPredicate(edgeData)) {
        nodesToReturn.push(edge.v);
      }
    });
    return nodesToReturn;
  }

  successors(nodeKey: string, filterPredicate: (data: E) => boolean = returnTrue) {
    let nodesToReturn: string[] = [];
    const outEdges = this.graph.outEdges(nodeKey);
    outEdges.forEach(edge => {
      let edgeData = this.graph.edge(edge.v, edge.w);
      if (filterPredicate(edgeData)) {
        nodesToReturn.push(edge.w);
      }
    });
    return nodesToReturn;
  }

  neighbors(nodeKey: string, filterPredicate: (data: E) => boolean = returnTrue) {
    return _.concat(this.predecessors(nodeKey, filterPredicate), this.successors(nodeKey, filterPredicate));
  }

  private innerRecurSuccessorsArray(
    nodeKey: string,
    successorsList: string[] = [],
    visited: { [key: string]: boolean } = {},
    filterPredicate: (data: E) => boolean = returnTrue
  ) {
    const successors = this.successors(nodeKey, filterPredicate) || [];
    if (successors.length > 0 && !visited[nodeKey]) {
      successors.forEach((successor: string) => {
        visited[nodeKey] = true;
        successorsList.push(successor);
        return this.innerRecurSuccessorsArray(successor, successorsList, visited, filterPredicate);
      });
    }
    return successorsList;
  }

  private innerRecurSuccessorsGraph(
    nodeKey: string,
    successorsGraph: Graph<N, E>,
    visited: { [key: string]: boolean } = {},
    filterPredicate: (data: E) => boolean = returnTrue
  ) {
    const successors = this.successors(nodeKey, filterPredicate) || [];
    if (successors.length > 0 && !visited[nodeKey]) {
      successors.forEach((successor: string) => {
        visited[nodeKey] = true;
        successorsGraph.setNode(successor, this.graph.node(successor));
        successorsGraph.setEdge(nodeKey, successor, this.graph.edge(nodeKey, successor));
        return this.innerRecurSuccessorsGraph(successor, successorsGraph, visited, filterPredicate);
      });
    }
    return successorsGraph;
  }

  private innerRecurSuccessorsLayers(
    nodeKeys: string[],
    layers: string[][],
    floor: number,
    filterPredicate: (data: E) => boolean = returnTrue
  ) {
    if (nodeKeys.length > 0) {
      let nextFloor = floor + 1;
      layers.push([]);
      layers[floor].forEach((successor: string) => {
        layers[nextFloor] = layers[nextFloor].concat(this.successors(successor, filterPredicate));
      });
      return this.innerRecurSuccessorsLayers(layers[nextFloor], layers, nextFloor, filterPredicate);
    }
    return layers;
  }

  getSuccessorsArrayRecursively(nodeKey: string, filterPredicate: (data: E) => boolean = returnTrue): string[] {
    return _.uniq(this.innerRecurSuccessorsArray(nodeKey, [], {}, filterPredicate));
  }

  getSuccessorsGraphRecursively(nodeKey: string, filterPredicate: (data: E) => boolean = returnTrue): Graph<N, E> {
    // also returns the original nodeKey as part of the returned sub-graph
    let g = new Graph<N, E>();
    g.setNode(nodeKey, this.graph.node(nodeKey));
    return this.innerRecurSuccessorsGraph(nodeKey, g, {}, filterPredicate);
  }

  getSuccessorsLayersRecursively(
    nodeKey: string,
    filterPredicate: (data: E) => boolean = returnTrue,
    order: 'fromSource' | 'fromLastLeaf' = 'fromSource'
  ): string[][] | never {
    let successorsGraph = this.getSuccessorsGraphRecursively(nodeKey, filterPredicate);
    if (!isAcyclic(successorsGraph)) {
      throw new Error('cyclic dependency');
    }
    let layers: string[][] = [];
    layers[0] = [nodeKey];
    let floor = 0;
    let rawLayers = this.innerRecurSuccessorsLayers([nodeKey], layers, floor, filterPredicate);
    return arrangeLayers(rawLayers, order);
  }

  private innerRecurPredecessorsArray(
    nodeKey: string,
    predecessorsList: string[] = [],
    visited: { [key: string]: boolean } = {},
    filterPredicate: (data: E) => boolean = returnTrue
  ) {
    const predecessors = this.predecessors(nodeKey, filterPredicate) || [];
    if (predecessors.length > 0 && !visited[nodeKey]) {
      predecessors.forEach((predecessor: string) => {
        visited[nodeKey] = true;
        predecessorsList.push(predecessor);
        return this.innerRecurPredecessorsArray(predecessor, predecessorsList, visited, filterPredicate);
      });
    }
    return predecessorsList;
  }

  private innerRecurPredecessorsGraph(
    nodeKey: string,
    predecessorsGraph: Graph<N, E>,
    visited: { [key: string]: boolean } = {},
    filterPredicate: (data: E) => boolean = returnTrue
  ) {
    const predecessors = this.predecessors(nodeKey, filterPredicate) || [];
    if (predecessors.length > 0 && !visited[nodeKey]) {
      predecessors.forEach((predecessor: string) => {
        visited[nodeKey] = true;
        predecessorsGraph.setNode(predecessor, this.graph.node(predecessor));
        predecessorsGraph.setEdge(nodeKey, predecessor, this.graph.edge(nodeKey, predecessor));
        return this.innerRecurPredecessorsGraph(predecessor, predecessorsGraph, visited, filterPredicate);
      });
    }
    return predecessorsGraph;
  }

  private innerRecurPredecessorsLayers(
    nodeKeys: string[],
    layers: string[][],
    floor: number,
    filterPredicate: (data: E) => boolean = returnTrue
  ) {
    if (nodeKeys.length > 0) {
      let nextFloor = floor + 1;
      layers.push([]);
      layers[floor].forEach((predecessor: string) => {
        layers[nextFloor] = layers[nextFloor].concat(this.predecessors(predecessor, filterPredicate));
      });
      return this.innerRecurPredecessorsLayers(layers[nextFloor], layers, nextFloor, filterPredicate);
    }
    return layers;
  }

  getPredecessorsArrayRecursively(nodeKey: string, filterPredicate: (data: E) => boolean = returnTrue): string[] {
    return _.uniq(this.innerRecurPredecessorsArray(nodeKey, [], {}, filterPredicate));
  }

  getPredecessorsGraphRecursively(nodeKey: string, filterPredicate: (data: E) => boolean = returnTrue): Graph<N, E> {
    // also returns the original nodeKey as part of the returned sub-graph
    let g = new Graph<N, E>();
    g.setNode(nodeKey, this.graph.node(nodeKey));
    return this.innerRecurPredecessorsGraph(nodeKey, g, {}, filterPredicate);
  }

  getPredecessorsLayersRecursively(
    nodeKey: string,
    filterPredicate: (data: E) => boolean = returnTrue,
    order: 'fromSource' | 'fromLastLeaf' = 'fromSource'
  ): string[][] | never {
    let successorsGraph = this.getPredecessorsGraphRecursively(nodeKey, filterPredicate); // first getting as a graph to check if cyclic
    if (!isAcyclic(successorsGraph)) {
      throw new Error('cyclic sub-graph');
    }
    let layers: string[][] = [];
    layers[0] = [nodeKey];
    let floor = 0;
    let rawLayers = this.innerRecurPredecessorsLayers([nodeKey], layers, floor, filterPredicate);
    return arrangeLayers(rawLayers, order);
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

  isCyclic(graph: Graph<N, E>) {
    return !isAcyclic(graph);
  }

  isDirected() {
    return this.graph.isDirected();
  }

  isMultigraph() {
    return this.graph, this.isMultigraph();
  }
}

function returnTrue() {
  return true;
}

function arrangeLayers(layers: string[][], order: 'fromSource' | 'fromLastLeaf') {
  let finalLayers: string[][] = [];
  let seenNodes: string[] = [];
  layers = layers.reverse();
  let i = 0;
  layers.forEach(layer => {
    if (layer.length > 0) {
      finalLayers.push([]);
      layer.forEach(node => {
        if (seenNodes.indexOf(node) == -1) {
          //if node not seen
          seenNodes.push(node);
          finalLayers[i].push(node);
        }
      });
      i++;
    }
  });
  return order === 'fromSource' ? finalLayers.reverse() : finalLayers;
}

export type NodeId = string;

export class Node<N> {
  constructor(readonly key: NodeId, readonly value: N) {}

  static fromObject<N>(object: { key: NodeId; value: N }) {
    return new Node(object.key, object.value);
  }
}

/**
 * A single directed edge consisting of a source id, target id,
 * and the data associated with the edge.
 *
 * @tparam ED type of the edge attribute
 *
 * @param srcId The vertex id of the source vertex
 * @param dstId The vertex id of the target vertex
 * @param attr The attribute associated with the edge
 */
export class Edge<ED> {
  constructor(readonly sourceKey: NodeId, readonly targetKey: NodeId, readonly data: ED) {}

  static fromObject<ED>(object: RawEdge<ED>) {
    return new Edge(object.sourceKey, object.targetKey, object.data);
  }

  get id(): string {
    return `${this.sourceKey}_${this.targetKey}`;
  }
}

export type RawEdge<ED> = {
  sourceKey: NodeId;
  targetKey: NodeId;
  data: ED;
};
