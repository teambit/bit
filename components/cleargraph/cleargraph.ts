import { Node } from './index';
import { Edge } from './index';
import { CyclicError, NodeDoesntExist } from './index';
import _ from 'lodash';
import { tarjan } from '@teambit/graph.algorithms.tarjan';
import { genericParseNode, genericNodeToJson } from './node';
import { genericParseEdge, genericEdgeToJson } from './edge';

/**
 * Graph abstractly represents a graph with arbitrary objects
 * associated with nodes and edges. The graph provides basic
 * operations to access and manipulate the data associated with
 * nodes and edges as well as the underlying structure.
 *
 * @tparam N the node attribute type
 * @tparam E the edge attribute type
 */

export class Graph<N, E> {
  constructor(
    /**
     * array of graph nodes.
     */
    nodes: Node<N>[] = [],
    /**
     * array of graph edges.
     */
    edges: Edge<E>[] = []
  ) {
    nodes.forEach((elem) => this.setNode(elem));
    edges.forEach((elem) => this.setEdge(elem));
  }

  protected create(nodes: Node<N>[] = [], edges: Edge<E>[] = []): this {
    return new Graph(nodes, edges) as this;
  }

  private _nodes = new Map<string, Node<N>>();
  private _edges = new Map<string, Edge<E>>();

  /**
   * set a new node on the graph or override existing node with the same key
   * @param id string
   * @param node a node of generic data type N
   */
  setNode(node: Node<N>, overrideExisting = true): this {
    if (!this.hasNode(node.id)) {
      this._nodes.set(node.id, node);
    } else if (overrideExisting) {
      let existingNode = this.node(node.id);
      if (existingNode) {
        existingNode.attr = node.attr;
      }
    }
    return this;
  }

  /**
   * set a new edge on the graph or override existing edge with the same source and target keys.
   * @param sourceId the id of the source node
   * @param targetId the id of the target node
   * @param edge an edge of the generic data type E
   */
  setEdge(edge: Edge<E>, overrideExisting = true): this {
    const sourceId = edge.sourceId;
    const targetId = edge.targetId;
    if (this.hasEdge(sourceId, targetId)) {
      if (overrideExisting) {
        let existingEdge = this.edge(sourceId, targetId);
        if (existingEdge) {
          existingEdge.attr = edge.attr;
        }
        return this;
      } else {
        return this;
      }
    }
    const id = Edge.edgeId(sourceId, targetId);
    this._edges.set(id, edge);
    if (this._nodes.has(sourceId)) {
      let sourceNode = this._nodes.get(sourceId);
      if (sourceNode !== undefined) {
        sourceNode.setOutEdge(id);
      }
    } else {
      throw Error(`source node ${sourceId} does not exist`);
    }
    if (this._nodes.has(targetId)) {
      let targetNode = this._nodes.get(targetId);
      if (targetNode !== undefined) {
        targetNode.setInEdge(id);
      }
    } else {
      throw Error(`target node ${targetId} does not exist`);
    }
    return this;
  }

  /**
   * set multiple nodes on the graph.
   * @param nodes an array of objects {id, node}
   */
  setNodes(nodes: Node<N>[], overrideExisting = true): this {
    nodes.forEach((node) => {
      if (!this.hasNode(node.id)) {
        this.setNode(node);
      } else if (!!overrideExisting) {
        let existingNode = this.node(node.id);
        if (existingNode) {
          existingNode.attr = node.attr;
        }
      }
    });
    return this;
  }

  /**
   * set multiple edges on the graph.
   * @param edges an array of objects {sourceId, targetId, edge}
   */
  setEdges(edges: Edge<E>[], overrideExisting = true): this {
    edges.forEach((edge) => {
      if (!this.hasEdge(edge.sourceId, edge.targetId)) {
        this.setEdge(edge);
      } else if (!!overrideExisting) {
        let existingEdge = this.edge(edge.sourceId, edge.targetId);
        if (existingEdge) {
          existingEdge.attr = edge.attr;
        }
      }
    });
    return this;
  }

  /**
   * determine whether a node exists on the graph.
   * @param id the node id - string
   */
  hasNode(id: string): boolean {
    return this._nodes.has(id);
  }

  /**
   * determine whether an edge exists on the graph.
   * @param sourceId the source node id (string)
   * @param targetId the target node id (string)
   */
  hasEdge(sourceId: string, targetId: string): boolean {
    return this._edges.has(Edge.edgeId(sourceId, targetId));
  }

  /**
   * get a node from the graph by its ID. Undefined if id is not in graph.
   * @param id the id of the node - string
   */
  node(id: string): Node<N> | undefined {
    return this._nodes.get(id);
  }

  /**
   * get a list of nodes from the graph by their IDs.
   * @param ids the ids of the nodes - string[]
   */
  getNodes(ids: string[]): Node<N>[] {
    let nodes: Node<N>[] = [];
    ids.forEach((id) => {
      const node = this._nodes.get(id);
      if (!!node) nodes.push(node);
    });
    return nodes;
  }

  /**
   * get an edge from the graph by its ID. Undefined if id is not in graph.
   * @param sourceId the id of the source node
   * @param targetId the id of the target node
   */
  edge(sourceId: string, targetId: string): Edge<E> | undefined {
    return this._edges.get(Edge.edgeId(sourceId, targetId));
  }

  /**
   * returns a Edge object from the graph by its ID. Undefined if id is not in graph.
   * @param edgeId the internal id the graph assigns to edges of the form "a->b"
   */
  edgeById(edgeId: string) {
    return this._edges.get(edgeId);
  }

  /**
   * get an edgeId of the format "a->b" and returns its source node Id and target node id.
   * @param edgeId
   */
  edgeNodesById(edgeId: string): { sourceId: string | undefined; targetId: string | undefined } {
    return {
      sourceId: this._edges.get(edgeId)?.sourceId,
      targetId: this._edges.get(edgeId)?.targetId,
    };
  }

  /**
   * get a map of all <nodeId, node> in the graph.
   */
  get nodeMap(): Map<string, Node<N>> {
    return this._nodes;
  }

  /**
   * get all <edgeId, edge> in the graph.
   */
  get edgeMap(): Map<string, Edge<E>> {
    return this._edges;
  }

  /**
   * get an array of all nodes in the graph.
   * note, this creates a new array every time
   */
  get nodes(): Array<Node<N>> {
    return [...this._nodes.values()];
  }

  /**
   * get an array of all edges in the graph.
   * note, this creates a new array every time
   */
  get edges(): Array<Edge<E>> {
    return [...this._edges.values()];
  }

  /**
   * return the number of nodes in the graph.
   */
  nodeCount(): number {
    return this._nodes.size;
  }

  /**
   * return the number of edges in the graph.
   */
  edgeCount(): number {
    return this._edges.size;
  }

  /**
   * return all nodes that have only out edges and no in edges.
   */
  sources(): Array<Node<N>> {
    let nodesToReturn = [...this._nodes.values()];
    return nodesToReturn.filter((node) => node.isSource()).map((elem) => elem);
  }

  /**
   * return all nodes that have only in edges and no out edges.
   */
  sinks(): Array<Node<N>> {
    let nodesToReturn = [...this._nodes.values()];
    return nodesToReturn.filter((node) => node.isSink()).map((elem) => elem);
  }

  /**
   * delete a single node by id if exists. Note that all edges to and from this node will also be deleted.
   * @param id the id of the node to be deleted
   */
  deleteNode(id: string): void {
    const node = this.node(id);
    if (typeof node === 'undefined') return;
    node.nodeEdges.forEach((edgeId: string) => {
      const { sourceId, targetId } = Edge.parseEdgeId(edgeId);
      this.deleteEdge(sourceId, targetId);
    });
    this._nodes.delete(id);
  }

  /**
   * delete a single edge by source and target ids if exist.
   * @param sourceId the id of the source node of the edge to be deleted
   * @param targetId the id of the target node of the edge to be deleted
   */
  deleteEdge(sourceId: string, targetId: string): void {
    const edgeId = Edge.edgeId(sourceId, targetId);
    const edge = this._edges.get(edgeId);
    if (edge !== undefined) {
      let sourceNode = this._nodes.get(sourceId);
      if (sourceNode !== undefined) {
        sourceNode.deleteEdge(edgeId);
      }
      let targetNode = this._nodes.get(targetId);
      if (targetNode !== undefined) {
        targetNode.deleteEdge(edgeId);
      }
    }
    this._edges.delete(edgeId);
  }

  /**
   * return a map <string, Edge> of all inbound edges of the given node.
   * @param nodeId string
   */
  inEdgesMap(nodeId: string): Map<string, Edge<E>> {
    return this._inEdges(nodeId);
  }

  /**
   * return a map <string, Edge> of all outbound edges of the given node.
   * @param nodeId string
   */
  outEdgesMap(nodeId: string): Map<string, Edge<E>> {
    return this._outEdges(nodeId);
  }

  /**
   * return a map <string, Edge> of all inbound and outbound edges of the given node.
   * @param nodeId string
   */
  nodeEdgesMap(nodeId: string): Map<string, Edge<E>> {
    return this._nodeEdges(nodeId);
  }

  /**
   * return an array of all inbound edges of the given node.
   * @param nodeId string
   */
  inEdges(nodeId: string): Array<Edge<E>> {
    return [...this._inEdges(nodeId).values()];
  }

  /**
   * return an array of all outbound edges of the given node.
   * @param nodeId string
   */
  outEdges(nodeId: string): Array<Edge<E>> {
    return [...this._outEdges(nodeId).values()];
  }

  /**
   * return an array of all inbound and outbound edges of the given node.
   * @param nodeId string
   */
  nodeEdges(nodeId: string): Array<Edge<E>> {
    return [...this._nodeEdges(nodeId).values()];
  }

  /**
   * private. return a map of all <edgeId, Edge<E>> that point to the given node.
   * @param nodeId
   */
  private _inEdges(nodeId: string): Map<string, Edge<E>> {
    let newEdges = new Map<string, Edge<E>>();
    const node = this.node(nodeId);
    if (node === undefined) return newEdges;
    node.inEdges.forEach((edgeId) => {
      let { sourceId, targetId } = Edge.parseEdgeId(edgeId);
      let edge = this.edge(sourceId, targetId);
      if (edge !== undefined) {
        newEdges.set(edgeId, edge);
      }
    });
    return newEdges;
  }

  /**
   * return a map of all <edgeId, Edge<E>> that point from the given node to other nodes.
   * @param nodeId
   */
  private _outEdges(nodeId: string): Map<string, Edge<E>> {
    let newEdges = new Map<string, Edge<E>>();
    const node = this.node(nodeId);
    if (node === undefined) return newEdges;
    node.outEdges.forEach((edgeId) => {
      let { sourceId, targetId } = Edge.parseEdgeId(edgeId);
      let edge = this.edge(sourceId, targetId);
      if (edge !== undefined) {
        newEdges.set(edgeId, edge);
      }
    });
    return newEdges;
  }

  /**
   * return a map of all <edgeId, Edge<E>> that point to or from the given node.
   * @param nodeId
   */
  private _nodeEdges(nodeId: string): Map<string, Edge<E>> {
    let newEdges = new Map<string, Edge<E>>();
    const node = this.node(nodeId);
    if (node === undefined) return newEdges;
    node.nodeEdges.forEach((edgeId) => {
      let { sourceId, targetId } = Edge.parseEdgeId(edgeId);
      let edge = this.edge(sourceId, targetId);
      if (edge !== undefined) {
        newEdges.set(edgeId, edge);
      }
    });
    return newEdges;
  }

  /**
   * return a map of all <nodeId, node> that are immediately pointed to by the given node.
   * @param nodeId the id of the source node
   * @param { nodeFilter, edgeFilter } - object with two boolean functions: nodeFilter which traverses the graph only on
   * nodes that return truthy for it, and edgeFilter which performs the same for edges.
   */
  successorMap(
    nodeId: string,
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): Map<string, Node<N>> {
    return this._successors(nodeId, { nodeFilter, edgeFilter });
  }

  /**
   * return a map of all <nodeId, node> that point to by the given node.
   * @param nodeId the id of the target node
   * @param { nodeFilter, edgeFilter } - object with two boolean functions: nodeFilter which traverses the graph only on
   * nodes that return truthy for it, and edgeFilter which performs the same for edges.
   * */
  predecessorMap(
    nodeId: string,
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): Map<string, Node<N>> {
    return this._predecessors(nodeId, { nodeFilter, edgeFilter });
  }

  /**
   * return a map of all <nodeId, node> that are directly or indirectly connected to the given node.
   * @param nodeId the id of the node
   * @param { nodeFilter, edgeFilter } - object with two boolean functions: nodeFilter which traverses the graph only on
   * nodes that return truthy for it, and edgeFilter which performs the same for edges.
   */
  neighborMap(
    nodeId: string,
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): Map<string, Node<N>> {
    return this._neighbors(nodeId, { nodeFilter, edgeFilter });
  }

  /**
   * Internal. Return a map of all <string, Node> that are immediately pointed to by the given node.
   * @param nodeId the id of the source node
   * @param { nodeFilter, edgeFilter } - object with two boolean functions: nodeFilter which traverses the graph only on
   * nodes that return truthy for it, and edgeFilter which performs the same for edges.
   * */
  private _successors(
    nodeId: string,
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): Map<string, Node<N>> {
    let successors = new Map<string, Node<N>>();
    const node = this.node(nodeId);
    if (node === undefined) return successors;
    node.outEdges.forEach((edgeId) => {
      const edge = this._edges.get(edgeId);
      if (edge != undefined && edgeFilter(edge)) {
        const { sourceId, targetId } = Edge.parseEdgeId(edgeId);
        const targetNode = this.node(targetId);
        if (!!targetId && targetNode !== undefined && nodeFilter(targetNode)) {
          successors.set(targetId, targetNode);
        }
      }
    });
    return successors;
  }

  /**
   * Private. Return a map of all <string, Node> that point to by the given node.
   * @param nodeId the id of the target node
   * @param { nodeFilter, edgeFilter } - object with two boolean functions: nodeFilter which traverses the graph only on
   * nodes that return truthy for it, and edgeFilter which performs the same for edges.
   */
  private _predecessors(
    nodeId: string,
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): Map<string, Node<N>> {
    let predecessors = new Map<string, Node<N>>();
    const node = this.node(nodeId);
    if (node === undefined) return predecessors;
    node.inEdges.forEach((edgeId) => {
      const edge = this._edges.get(edgeId);
      if (edge != undefined && edgeFilter(edge)) {
        const { sourceId, targetId } = Edge.parseEdgeId(edgeId);
        const sourceNode = this.node(sourceId);
        if (!!sourceId && sourceNode !== undefined && nodeFilter(sourceNode)) {
          predecessors.set(sourceId, sourceNode);
        }
      }
    });
    return predecessors;
  }

  /**
   * return a map of all <string, Node> that are directly or indirectly connected to the given node.
   * @param nodeId the id of the node
   * @param { nodeFilter, edgeFilter } - object with two boolean functions: nodeFilter which traverses the graph only on
   * nodes that return truthy for it, and edgeFilter which performs the same for edges.
   */
  private _neighbors(
    nodeId: string,
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): Map<string, Node<N>> {
    let neighbors = new Map([
      ...this._predecessors(nodeId, { nodeFilter, edgeFilter }),
      ...this._successors(nodeId, { nodeFilter, edgeFilter }),
    ]);
    return neighbors;
  }

  /**
   * return a sub-graph of all the nodes and edges that are recursively successors of the given node.
   * @param nodeIds the source nodes of the sub-graph required
   * @param { nodeFilter, edgeFilter } - object with two boolean functions: nodeFilter which traverses the graph only on
   * nodes that return truthy for it, and edgeFilter which performs the same for edges.
   */
  successorsSubgraph(
    nodeIds: string | string[],
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): this {
    return this._buildSubgraphs(nodeIds, 'successors', { nodeFilter, edgeFilter });
  }

  private _alreadyProcessed(nodeId: string, subgraphs: this[]): boolean {
    for (const graph of subgraphs) {
      if (graph.hasNode(nodeId)) {
        return true;
      }
    }
    return false;
  }

  private _buildSubgraphs(
    nodeIds: string | string[],
    order: 'successors' | 'predecessors',
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ) {
    let subgraphs: this[] = [];
    if (!Array.isArray(nodeIds)) {
      return this._buildSubgraph(nodeIds, order, { nodeFilter, edgeFilter });
    }
    nodeIds.forEach((nodeId) => {
      if (this._alreadyProcessed(nodeId, subgraphs)) {
        return;
      }
      subgraphs.push(this._buildSubgraph(nodeId, order, { nodeFilter, edgeFilter }));
    });
    if (subgraphs.length === 1) {
      return subgraphs[0];
    }
    let mergedGraphs: this = this.create();
    if (subgraphs.length) {
      mergedGraphs = subgraphs[0].merge(subgraphs);
    }
    return mergedGraphs;
  }

  private _buildSubgraph(
    nodeId: string,
    order: 'successors' | 'predecessors',
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ) {
    let g = this.create();
    let graphNode = this.node(nodeId);
    if (!graphNode) {
      throw new Error(`Node ${nodeId} does not exist on graph`);
    } else {
      g.setNode(graphNode);
    }
    return order === 'successors'
      ? this._successorsSubgraphUtil(nodeId, g, {}, { nodeFilter, edgeFilter })
      : this._predecessorsSubgraphUtil(nodeId, g, {}, { nodeFilter, edgeFilter });
  }

  private _successorsSubgraphUtil(
    nodeId: string,
    successorsGraph: this,
    visited: { [key: string]: boolean } = {},
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): this {
    const successors = [...this._successors(nodeId, { nodeFilter, edgeFilter }).keys()] || [];
    if (successors.length > 0 && !visited[nodeId]) {
      successors.forEach((successor: string) => {
        visited[nodeId] = true;
        const newNode = this._nodes.get(successor);
        const newEdge = this._edges.get(Edge.edgeId(nodeId, successor));
        if (newNode !== undefined && newEdge != undefined) {
          successorsGraph.setNode(newNode);
          successorsGraph.setEdge(newEdge);
          return this._successorsSubgraphUtil(successor, successorsGraph, visited, { nodeFilter, edgeFilter });
        }
      });
    }
    return successorsGraph;
  }

  /**
   * return an array of all the nodes that are recursively successors of the given node (that the given node points to).
   * @param node the source node of the successor array required
   * @param { nodeFilter, edgeFilter } - object with two boolean functions: nodeFilter which traverses the graph only on
   * nodes that return truthy for it, and edgeFilter which performs the same for edges.
   */
  successors(
    nodeId: string,
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): Array<Node<N>> {
    const successorIds = _.uniq(this._successorsArrayUtil(nodeId, [], {}, { nodeFilter, edgeFilter }));
    let successors: Node<N>[] = [];
    successorIds.forEach((id: string) => {
      let node = this.node(id);
      if (node != undefined) {
        successors.push(node);
      }
    });
    return successors;
  }

  private _successorsArrayUtil(
    nodeId: string,
    successorsList: string[] = [],
    visited: { [key: string]: boolean } = {},
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): string[] {
    const successors = [...this._successors(nodeId, { nodeFilter, edgeFilter }).keys()] || [];
    if (successors.length > 0 && !visited[nodeId]) {
      successors.forEach((successor: string) => {
        visited[nodeId] = true;
        successorsList.push(successor);
        return this._successorsArrayUtil(successor, successorsList, visited, { nodeFilter, edgeFilter });
      });
    }
    return successorsList;
  }

  successorsLayers(
    nodeKey: string,
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
      order = 'fromSource',
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
      order?: 'fromSource' | 'fromLastLeaf';
    } = {}
  ): string[][] | never {
    let successorsGraph = this.successorsSubgraph(nodeKey, { nodeFilter, edgeFilter });
    if (this.isCyclic(successorsGraph)) {
      throw new Error('cyclic dependency');
    }
    let layers: string[][] = [];
    layers[0] = [nodeKey];
    let floor = 0;
    let rawLayers = this._successorsLayersUtil([nodeKey], layers, floor, { nodeFilter, edgeFilter });
    return arrangeLayers(rawLayers, order);
  }

  private _successorsLayersUtil(
    nodeKeys: string[],
    layers: string[][],
    floor: number,
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): string[][] {
    if (nodeKeys.length > 0) {
      let nextFloor = floor + 1;
      layers.push([]);
      layers[floor].forEach((successor: string) => {
        const successors = [...this.successorMap(successor, { nodeFilter, edgeFilter }).keys()];
        layers[nextFloor] = layers[nextFloor].concat(successors);
      });
      return this._successorsLayersUtil(layers[nextFloor], layers, nextFloor, { nodeFilter, edgeFilter });
    }
    return layers;
  }

  /**
   * return a sub-graph of all the nodes and edges that are recursively predecessors (point to) of the given node.
   * @param nodeIds the target nodes of the sub-graph required
   * @param { nodeFilter, edgeFilter } - object with two boolean functions: nodeFilter which traverses the graph only on
   * nodes that return truthy for it, and edgeFilter which performs the same for edges.
   */
  predecessorsSubgraph(
    nodeIds: string | string[],
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): this {
    return this._buildSubgraphs(nodeIds, 'predecessors', { nodeFilter, edgeFilter });
  }

  private _predecessorsSubgraphUtil(
    nodeId: string,
    predecessorsGraph: this,
    visited: { [key: string]: boolean } = {},
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): this {
    const predecessors = [...this._predecessors(nodeId, { nodeFilter, edgeFilter }).keys()] || [];
    if (predecessors.length > 0 && !visited[nodeId]) {
      predecessors.forEach((predecessor: string) => {
        visited[nodeId] = true;
        const newNode = this._nodes.get(predecessor);
        const newEdge = this._edges.get(Edge.edgeId(predecessor, nodeId));
        if (newNode !== undefined && newEdge != undefined) {
          predecessorsGraph.setNode(newNode);
          predecessorsGraph.setEdge(newEdge);
          return this._predecessorsSubgraphUtil(predecessor, predecessorsGraph, visited, { nodeFilter, edgeFilter });
        }
      });
    }
    return predecessorsGraph;
  }

  /**
   * return an array of all the nodes that are recursively predecessors of the given node (that point to the given node).
   * @param node the source node of the predecessor array required
   * @param { nodeFilter, edgeFilter } - object with two boolean functions: nodeFilter which traverses the graph only on
   * nodes that return truthy for it, and edgeFilter which performs the same for edges.
   */
  predecessors(
    nodeId: string,
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): Array<Node<N>> {
    const predecessorIds = _.uniq(this._predecessorsArrayUtil(nodeId, [], {}, { nodeFilter, edgeFilter }));
    let predecessors: Node<N>[] = [];
    predecessorIds.forEach((id: string) => {
      let node = this.node(id);
      if (node != undefined) {
        predecessors.push(node);
      }
    });
    return predecessors;
  }

  private _predecessorsArrayUtil(
    nodeId: string,
    predecessorsList: string[] = [],
    visited: { [key: string]: boolean } = {},
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): string[] {
    const predecessors = [...this._predecessors(nodeId, { nodeFilter, edgeFilter }).keys()] || [];
    if (predecessors.length > 0 && !visited[nodeId]) {
      predecessors.forEach((predecessor: string) => {
        visited[nodeId] = true;
        predecessorsList.push(predecessor);
        return this._predecessorsArrayUtil(predecessor, predecessorsList, visited, { nodeFilter, edgeFilter });
      });
    }
    return predecessorsList;
  }

  predecessorsLayers(
    nodeKey: string,
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
      order = 'fromSource',
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
      order?: 'fromSource' | 'fromLastLeaf';
    } = {}
  ): string[][] | never {
    let successorsGraph = this.predecessorsSubgraph(nodeKey, { nodeFilter, edgeFilter }); // first getting as a graph to check if cyclic
    if (this.isCyclic(successorsGraph)) {
      throw new Error('cyclic sub-graph');
    }
    let layers: string[][] = [];
    layers[0] = [nodeKey];
    let floor = 0;
    let rawLayers = this._predecessorsLayersUtil([nodeKey], layers, floor, { nodeFilter, edgeFilter });
    return arrangeLayers(rawLayers, order);
  }

  private _predecessorsLayersUtil(
    nodeKeys: string[],
    layers: string[][],
    floor: number,
    {
      nodeFilter = returnTrue,
      edgeFilter = returnTrue,
    }: {
      nodeFilter?: (node: Node<N>) => boolean;
      edgeFilter?: (edge: Edge<E>) => boolean;
    } = {}
  ): string[][] {
    if (nodeKeys.length > 0) {
      let nextFloor = floor + 1;
      layers.push([]);
      layers[floor].forEach((predecessor: string) => {
        const predecessors = [...this.predecessorMap(predecessor, { nodeFilter, edgeFilter }).keys()];
        layers[nextFloor] = layers[nextFloor].concat(predecessors);
      });
      return this._predecessorsLayersUtil(layers[nextFloor], layers, nextFloor, { nodeFilter, edgeFilter });
    }
    return layers;
  }

  /**
   * A topological sort of the graph
   */
  toposort(reverse: boolean = false): Array<Node<N>> {
    let nodes = this._toposort().map((nodeId) => this.node(nodeId));
    nodes = _.compact(nodes); // remove any undefined entries
    //@ts-ignore
    return reverse ? nodes.reverse() : nodes;
  }

  private _transformEdges() {
    let edges: string[][] = [];
    this._edges.forEach((originalEdge) => {
      edges.push([originalEdge.sourceId, originalEdge.targetId]);
    });
    return edges;
  }

  private _toposort() {
    const nodes: string[] = [...this._nodes.keys()];
    const edges = this._transformEdges();
    var cursor = nodes.length,
      sorted = new Array(cursor),
      visited = {},
      i = cursor,
      outgoingEdges = makeOutgoingEdges(edges),
      nodesHash = makeNodesHash(nodes);

    // check for unknown nodes
    edges.forEach(function (edge) {
      if (!nodesHash.has(edge[0]) || !nodesHash.has(edge[1])) {
        throw new Error('Unknown node. There is an unknown node in the supplied edges.');
      }
    });

    while (i--) {
      //@ts-ignore
      if (!visited[i]) visit(nodes[i], i, new Set());
    }

    return sorted;
    //@ts-ignore
    function visit(node, i, predecessors) {
      if (predecessors.has(node)) {
        var nodeRep;
        try {
          nodeRep = ', node was:' + JSON.stringify(node);
        } catch (e) {
          nodeRep = '';
        }
        throw new CyclicError('Cyclic dependency' + nodeRep);
      }

      if (!nodesHash.has(node)) {
        throw new Error(
          'Found unknown node. Make sure to provide all involved nodes. Unknown node: ' + JSON.stringify(node)
        );
      }
      //@ts-ignore
      if (visited[i]) return;
      //@ts-ignore
      visited[i] = true;

      var outgoing = outgoingEdges.get(node) || new Set();
      outgoing = Array.from(outgoing);

      if ((i = outgoing.length)) {
        predecessors.add(node);
        do {
          var child = outgoing[--i];
          visit(child, nodesHash.get(child), predecessors);
        } while (i);
        predecessors.delete(node);
      }

      sorted[--cursor] = node;
    }
  }

  isCyclic(graph = this): boolean {
    try {
      graph.toposort();
    } catch (e) {
      if (e instanceof CyclicError) {
        return true;
      }
      throw e;
    }
    return false;
  }

  findCycles(graph = this): string[][] {
    return findCycles(graph);
  }

  /**
   * Merge the provided graphs (of the same type as this graph) from right to left into this graph
   * @param graphs any number of Graph objects
   */
  merge(graphs: this[]): this {
    let mergedGraph: this = this;
    graphs.forEach((incomingGraph) => {
      //iterate on nodes
      for (let [nodeId, node] of incomingGraph.nodeMap) {
        mergedGraph.setNode(node); // override right node data with left (incoming) node data if this node id exists or creates a new node with this id if doesn't exist
      }
      //iterate on edges
      for (let [edgeId, edge] of incomingGraph.edgeMap) {
        const sourceId = incomingGraph._edges.get(edgeId)?.sourceId;
        const targetId = incomingGraph._edges.get(edgeId)?.targetId;
        if (mergedGraph.edgeMap.has(edgeId) && !!sourceId && !!targetId) {
          mergedGraph.setEdge(edge); // override right edge data with left (incoming) edge data if edge id exists
        } else {
          // make sure both source and target nodes exist
          if (!!sourceId && !!targetId && mergedGraph.hasNode(sourceId) && mergedGraph.hasNode(targetId)) {
            mergedGraph.setEdge(edge);
          } else {
            throw NodeDoesntExist;
          }
        }
      }
    });
    return mergedGraph;
  }

  /**
   * find all paths from one node to another node.
   * @param sourceId
   * @param targetId
   */
  allPaths(sourceId: string, targetId: string): string[][] {
    const paths: string[][] = this._allPaths(sourceId, targetId, [], []);
    return paths;
  }

  private _allPaths(
    source: string,
    target: string,
    currPath: string[],
    paths: string[][],
    visited: { [key: string]: boolean } = {}
  ) {
    // Mark current node as visited and store in current path
    visited[source] = true;
    currPath.push(source);
    // If current node is same as destination, add current path to paths
    if (source === target) {
      paths.push(_.cloneDeep(currPath));
    } else {
      // If current node is not target, recur for all its succesors
      const successors = [...this._successors(source).keys()] || [];
      successors.forEach((nodeId) => {
        if (!visited[nodeId]) {
          this._allPaths(nodeId, target, currPath, paths, visited);
        }
      });
    }
    // Remove current node from currentPath[] and mark it as unvisited
    currPath.pop();
    visited[source] = false;
    return paths;
  }

  /**
   * returns the subgraph containing only the connections that fulfill the predicate
   * @param edgeFilter - a filter that traverses the graph only on edges that return truthy for it
   */
  filterByEdges(edgeFilter: (edge: Edge<E>) => boolean = returnTrue) {
    const newEdges = this.edges.filter((edge) => {
      return edgeFilter(edge);
    });
    const edgeNodesIds: string[] = [];
    newEdges.map((edge) => {
      edgeNodesIds.push(edge.source);
      edgeNodesIds.push(edge.target);
    });
    const uniqueNodeIds = [...new Set(edgeNodesIds)];
    const newNodes = this.nodes.filter((node) => {
      return uniqueNodeIds.includes(node.id);
    });
    return new Graph(newNodes, newEdges);
  }

  /***
   * graph to JSON object
   */
  toJson(graph?: this) {
    return graph ? this._toJson(graph, 'object') : this._toJson(this, 'object');
  }

  /**
   * stringify the graph to a JSON string
   * @param graph
   */
  stringify(graph?: this): string {
    return graph ? this._toJson(graph, 'string') : this._toJson(this, 'string');
  }

  /**
   * build graph from json
   * @param json should be of the format:
   * {
   *   nodes: {id: string, node: N}[],
   *   edges: {sourceId: string, targetId: string, edge:E}[]
   * }
   */
  static parse(
    json: string | object,
    parseNode: (data: any) => any = genericParseNode,
    parseEdge: (data: any) => any = genericParseEdge
  ) {
    return this._fromJson(json, parseNode, parseEdge);
  }

  /**
   * Gets a graph with (possibly) nodes that point to each other with two or more edges
   * and converts them to one bidirectional edge for each of the node pairs
   */
  static convertToBidirectionalEdges(graph: Graph<any, any>): Graph<any, any> {
    let newEdgeMap: Map<string, Edge<any>> = new Map();
    for (const [key, val] of graph.edgeMap) {
      if (!newEdgeMap.has(key)) {
        const reversedEdgeKey: string = val.targetId + '->' + val.sourceId;
        if (!newEdgeMap.has(reversedEdgeKey)) {
          newEdgeMap.set(key, val);
        } else {
          let reveresedEdge = newEdgeMap.get(reversedEdgeKey);
          reveresedEdge?.setBidirectional(true);
        }
      }
    }
    return new Graph(graph.nodes, [...newEdgeMap.values()]);
  }

  private _toJson(graph: Graph<any, any>, returnType: 'object' | 'string'): any {
    let nodeArray: { id: string; attr: string | object }[] = [];
    for (let [nodeId, nodeData] of graph.nodeMap.entries()) {
      const graphNode = graph.node(nodeId);
      if (!!graphNode) {
        let convertedNode: string | object;
        if (returnType === 'object') {
          if (!!graphNode.attr['toJson'] && typeof graphNode.attr['toJson'] === 'function') {
            convertedNode = graphNode.attr.toJson();
          } else {
            convertedNode = genericNodeToJson(graphNode.attr);
          }
        } else {
          convertedNode = graphNode.stringify();
        }
        nodeArray.push({
          id: nodeId,
          attr: convertedNode,
        });
      }
    }
    let edgeArray: { sourceId: string; targetId: string; attr: string | object; bidirectional: boolean; id: string }[] =
      [];
    for (let [edgeId, edgeData] of graph.edgeMap.entries()) {
      const graphEdge = graph.edgeById(edgeId);
      if (!!graphEdge) {
        let convertedEdge: string | object;
        if (returnType === 'object') {
          if (!!graphEdge.attr['toJson'] && typeof graphEdge.attr['toJson'] === 'function') {
            convertedEdge = graphEdge.attr.toJson();
          } else {
            convertedEdge = genericNodeToJson(graphEdge.attr);
          }
        } else {
          convertedEdge = graphEdge.stringify();
        }
        edgeArray.push({
          id: `${graphEdge.sourceId}->${graphEdge.targetId}`,
          sourceId: graphEdge.sourceId,
          targetId: graphEdge.targetId,
          attr: convertedEdge,
          bidirectional: graphEdge.bidirectional,
        });
      }
    }
    let json = {
      nodes: nodeArray,
      edges: edgeArray,
    };

    return returnType === 'object' ? json : JSON.stringify(json);
  }

  /**
   * builds a graph from the provided JSON.
   * @param json should be of the format:
   * {
   *   nodes: {id: string, node: N}[],
   *   edges: {sourceId: string, targetId: string, edge:E}[]
   * }
   */
  static _fromJson(json: string | object, parseNode: (data: any) => any, parseEdge: (data: any) => any) {
    const obj = typeof json === 'string' ? JSON.parse(json) : json;
    let graph = new Graph();
    if (!obj.hasOwnProperty('nodes') || !obj.hasOwnProperty('edges')) {
      throw Error(
        'missing properties on JSON. Should contain nodes: {id: string, node: N}[], and edges: {sourceId: string, targetId: string, edge:E}[]'
      );
    }
    obj.nodes.forEach((nodeObj: any) => {
      const res = Node.fromObject(nodeObj, parseNode);
      graph.setNode(res);
    });
    obj.edges.forEach((edgeObj: any) => {
      const res = Edge.fromObject(edgeObj, parseEdge);
      graph.setEdge(res);
    });
    return graph;
  }

  bfs() {}

  dfs() {}
}

function returnTrue() {
  return true;
}

//@ts-ignore
function makeOutgoingEdges(arr) {
  var edges = new Map();
  for (var i = 0, len = arr.length; i < len; i++) {
    var edge = arr[i];
    if (!edges.has(edge[0])) edges.set(edge[0], new Set());
    if (!edges.has(edge[1])) edges.set(edge[1], new Set());
    edges.get(edge[0]).add(edge[1]);
  }
  return edges;
}

//@ts-ignore
function makeNodesHash(arr) {
  var res = new Map();
  for (var i = 0, len = arr.length; i < len; i++) {
    res.set(arr[i], i);
  }
  return res;
}

function findCycles(g: Graph<any, any>): string[][] {
  return _.filter(tarjan(g), function (cmpt: string[]) {
    return cmpt.length > 1 || (cmpt.length === 1 && g.hasEdge(cmpt[0], cmpt[0]));
  });
}

function arrangeLayers(layers: string[][], order: 'fromSource' | 'fromLastLeaf') {
  let finalLayers: string[][] = [];
  let seenNodes: string[] = [];
  layers = layers.reverse();
  let i = 0;
  layers.forEach((layer) => {
    if (layer.length > 0) {
      finalLayers.push([]);
      layer.forEach((node) => {
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
