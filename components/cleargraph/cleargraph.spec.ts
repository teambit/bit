import { Graph, CyclicError, Node, Edge } from './index';

class NodeData {
  id: string;
  name: string;
  version: string;
  constructor(id: string, name: string, version: string) {
    this.id = id;
    this.name = name;
    this.version = version;
  }
  stringify() {
    return JSON.stringify({ name: this.name, version: this.version });
  }
}

class EdgeData {
  dep: 'peer' | 'dev' | 'regular';
  semDist: number;
  constructor(dep: 'peer' | 'dev' | 'regular', semDist: number) {
    this.dep = dep;
    this.semDist = semDist;
  }
  stringify() {
    return JSON.stringify({ dep: this.dep, semDist: this.semDist });
  }
}

let nodeArr = [
  new Node('a', new NodeData('a', 'comp1', '1.0.0')),
  new Node('b', new NodeData('b', 'comp2', '2.0.0')),
  new Node('c', new NodeData('c', 'comp3', '1.0.0')),
  new Node('d', new NodeData('d', 'comp4', '15.0.0')),
  new Node('e', new NodeData('e', 'comp5', '3.0.0')),
  new Node('f', new NodeData('f', 'comp6', '2.0.0')),
  new Node('g', new NodeData('g', 'comp7', '2.0.0')),
];

let edgeArr = [
  new Edge('a', 'b', new EdgeData('peer', 3)),
  new Edge('a', 'c', new EdgeData('dev', 3)),
  new Edge('c', 'd', new EdgeData('regular', 3)),
  new Edge('c', 'e', new EdgeData('regular', 3)),
  new Edge('d', 'f', new EdgeData('peer', 1)),
  new Edge('e', 'd', new EdgeData('dev', 1)),
  new Edge('g', 'a', new EdgeData('dev', 1)),
];

let g = new Graph<NodeData, EdgeData>(nodeArr, edgeArr);

describe('graphTester', () => {
  describe('basicTester', () => {
    it('should return node', () => {
      expect(g.node('b')).toEqual({
        id: 'b',
        attr: { id: 'b', name: 'comp2', version: '2.0.0' },
        _inEdges: ['a->b'],
        _outEdges: [],
      });
    });

    it('should return undefined for missing node', () => {
      expect(g.node('l')).toBeUndefined;
    });

    it('should return edge', () => {
      expect(g.edge('a', 'b')).toEqual({
        sourceId: 'a',
        targetId: 'b',
        attr: { dep: 'peer', semDist: 3 },
        bidirectional: false,
      });
    });

    it('should return undefined for missing edge', () => {
      expect(g.edge('l', 't')).toBeUndefined;
    });

    it('should return true for an existing edge', () => {
      expect(g.hasEdge('c', 'd')).toBeTruthy;
    });

    it('should return edge source and target Ids by edgeId', () => {
      const { sourceId, targetId } = g.edgeNodesById('a->b');
      expect(sourceId).toEqual('a');
      expect(targetId).toEqual('b');
    });

    it('should override existing node with same id', () => {
      const newNodes = [new Node('c', new NodeData('c', 'newNode', '1.0.0'))];
      expect(g.setNodes(newNodes).node('c')?.attr.name).toEqual('newNode');
      g.setNode(new Node('c', new NodeData('c', 'comp3', '1.0.0')));
    });

    it('should override existing edge with same source, target ids', () => {
      const newEdges = [new Edge('a', 'b', new EdgeData('dev', 3))];
      g.setEdges(newEdges);
      expect(g.edge('a', 'b')?.attr.dep).toEqual('dev');
      g.setEdge(new Edge('a', 'b', new EdgeData('peer', 3)));
    });

    it('should not override existing node with same id', () => {
      const newNodes = [new Node('c', new NodeData('c', 'newNode', '1.0.0'))];
      expect(g.setNodes(newNodes, false).node('c')?.attr.name).toEqual('comp3');
      g.setNode(new Node('c', new NodeData('c', 'comp3', '1.0.0')));
    });

    it('should not override existing edge with same source, target ids', () => {
      const newEdges = [new Edge('a', 'b', new EdgeData('dev', 3))];
      g.setEdges(newEdges, false);
      expect(g.edge('a', 'b')?.attr.dep).toEqual('peer');
      g.setEdge(new Edge('a', 'b', new EdgeData('peer', 3)));
    });

    it('should return all graph nodes as a map', () => {
      const keys = [...g.nodeMap.keys()];
      expect(keys).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    });

    it('should return all graph edges as a map', () => {
      const keys = [...g.edgeMap.keys()];
      expect(keys).toEqual(['a->b', 'a->c', 'c->d', 'c->e', 'd->f', 'e->d', 'g->a']);
    });

    it('should return all graph nodes as an array', () => {
      const nodes = g.nodes;
      expect(nodes.length).toEqual(7);
      // expect(nodes[0]).to.be.an('object');
    });

    it('should return all graph edges as an array', () => {
      const edges = g.edges;
      expect(edges.length).toEqual(7);
      // expect(edges[0]).to.be.an('object');
    });

    it('should return the correct node count', () => {
      expect(g.nodeCount()).toEqual(7);
    });

    it('should return the correct edge count', () => {
      expect(g.edgeCount()).toEqual(7);
    });

    it('should return all graph sources', () => {
      const res = g.sources();
      const ids = res.map((elem) => (elem ? elem.id : ''));
      expect(ids).toEqual(['g']);
    });

    it('should return all graph sinks', () => {
      const res = g.sinks();
      const ids = res.map((elem) => (elem ? elem.id : ''));
      expect(ids).toEqual(['b', 'f']);
    });

    it('should delete node', () => {
      g.setNode(new Node('h', new NodeData('h', 'comp8', '1.0.0')));
      expect(g.nodeCount()).toEqual(8);
      g.deleteNode('h');
      expect(g.nodeCount()).toEqual(7);
    });

    it('should delete edge', () => {
      g.setEdge(new Edge('g', 'd', new EdgeData('dev', 1)));
      expect(g.edgeCount()).toEqual(8);
      g.deleteEdge('g', 'd');
      expect(g.edgeCount()).toEqual(7);
    });

    it('should return a map of all in edges of a given node', () => {
      const keys = [...g.inEdgesMap('d').keys()];
      expect(keys).toEqual(['c->d', 'e->d']);
    });

    it('should return a map of all out edges of a given node', () => {
      const keys = [...g.outEdgesMap('a').keys()];
      expect(keys).toEqual(['a->b', 'a->c']);
    });

    it('should return a map of all node edges of a given node', () => {
      const keys = [...g.nodeEdgesMap('a').keys()];
      expect(keys).toEqual(['g->a', 'a->b', 'a->c']);
    });

    it('should return an array of all in edges of a given node', () => {
      const inEdges = g.inEdges('d');
      expect(inEdges.length).toEqual(2);
      // expect(inEdges[0]).to.be.an('object');
      expect(inEdges[0].id).toEqual('c->d');
      // expect(inEdges).toEqual([ 'c->d', 'e->d' ]);
    });

    it('should return an array of all out edges of a given node', () => {
      const outEdges = g.outEdges('a');
      expect(outEdges.length).toEqual(2);
      // expect(outEdges[0]).to.be.an('object');
      expect(outEdges[0].id).toEqual('a->b');
      // expect(keys).toEqual([ 'a->b', 'a->c' ]);
    });

    it('should return an array of all node edges of a given node', () => {
      const nodeEdges = g.nodeEdges('a');
      expect(nodeEdges.length).toEqual(3);
      // expect(nodeEdges[0]).to.be.an('object');
      expect(nodeEdges[0].id).toEqual('g->a');
      // expect(nodeEdges).toEqual([ 'g->a', 'a->b', 'a->c' ]);
    });

    it('should find immediate successors of a given node', () => {
      const successorMap = g.successorMap('c');
      const keys = [...successorMap.keys()];
      expect(keys).toEqual(['d', 'e']);
    });

    it('should find immediate predecessors of a given node', () => {
      const keys = [...g.predecessorMap('c').keys()];
      expect(keys).toEqual(['a']);
    });

    it('should find neighbors of a given node', () => {
      const keys = [...g.neighborMap('c').keys()];
      expect(keys).toEqual(['a', 'd', 'e']);
    });

    it('should find recursive successors sub-graph of a given node', () => {
      const node = g.node('c');
      const subgraph = node ? g.successorsSubgraph(node.id) : new Graph();
      const nodeKeys = [...subgraph.nodeMap.keys()];
      const edgeKeys = [...subgraph.edgeMap.keys()];
      expect(nodeKeys).toEqual(['c', 'd', 'f', 'e']);
      expect(edgeKeys).toEqual(['c->d', 'd->f', 'c->e', 'e->d']);
    });

    it('should find recursive successors sub-graph of two nodes where one is a successor of the other', () => {
      const node1 = g.node('a');
      const node2 = g.node('c');
      const subgraph = node1 && node2 ? g.successorsSubgraph([node1.id, node2.id]) : new Graph();
      const nodeKeys = [...subgraph.nodeMap.keys()];
      const edgeKeys = [...subgraph.edgeMap.keys()];
      expect(nodeKeys).toEqual(['a', 'b', 'c', 'd', 'f', 'e']);
      expect(edgeKeys).toEqual(['a->b', 'a->c', 'c->d', 'd->f', 'c->e', 'e->d']);
    });

    it('should find recursive successors sub-graph of two nodes where one is *not* a successor of the other', () => {
      g.setNode(new Node('h', new NodeData('h', 'comp22', '1.0.0')));
      g.setEdge(new Edge('b', 'h', new EdgeData('peer', 1)));
      const node1 = g.node('b');
      const node2 = g.node('c');
      const subgraph = node1 && node2 ? g.successorsSubgraph([node1.id, node2.id]) : new Graph();
      const nodeKeys = [...subgraph.nodeMap.keys()];
      const edgeKeys = [...subgraph.edgeMap.keys()];
      expect(nodeKeys).toEqual(['b', 'h', 'c', 'd', 'f', 'e']);
      expect(edgeKeys).toEqual(['b->h', 'c->d', 'd->f', 'c->e', 'e->d']);
      g.deleteNode('h');
      g.deleteEdge('b', 'h');
    });

    it('should find recursive predecessors sub-graph of a given node', () => {
      const node = g.node('d');
      const subgraph = node ? g.predecessorsSubgraph(node.id) : new Graph();
      const nodeKeys = [...subgraph.nodeMap.keys()];
      const edgeKeys = [...subgraph.edgeMap.keys()];
      expect(nodeKeys).toEqual(['d', 'c', 'a', 'g', 'e']);
      expect(edgeKeys).toEqual(['c->d', 'a->c', 'g->a', 'e->d', 'c->e']);
    });

    it('should find recursive predecessors sub-graph of two nodes where one is a predecessor of the other', () => {
      const node1 = g.node('d');
      const node2 = g.node('c');
      const subgraph = node1 && node2 ? g.predecessorsSubgraph([node1.id, node2.id]) : new Graph();
      const nodeKeys = [...subgraph.nodeMap.keys()];
      const edgeKeys = [...subgraph.edgeMap.keys()];
      expect(nodeKeys).toEqual(['d', 'c', 'a', 'g', 'e']);
      expect(edgeKeys).toEqual(['c->d', 'a->c', 'g->a', 'e->d', 'c->e']);
    });

    it('should find recursive predecessors sub-graph of two nodes where one is *not* a predecessor of the other', () => {
      g.setNode(new Node('h', new NodeData('h', 'comp22', '1.0.0')));
      g.setEdge(new Edge('b', 'h', new EdgeData('peer', 1)));
      const node1 = g.node('d');
      const node2 = g.node('h');
      const subgraph = node1 && node2 ? g.predecessorsSubgraph([node1.id, node2.id]) : new Graph();
      const nodeKeys = [...subgraph.nodeMap.keys()];
      const edgeKeys = [...subgraph.edgeMap.keys()];
      expect(nodeKeys).toEqual(['d', 'c', 'a', 'g', 'e', 'h', 'b']);
      expect(edgeKeys).toEqual(['c->d', 'a->c', 'g->a', 'e->d', 'c->e', 'b->h', 'a->b']);
      g.deleteNode('h');
      g.deleteEdge('b', 'h');
    });

    it('should find recursive successors array of a given node', () => {
      const node = g.node('c');
      const arr = !!node ? g.successors(node.id).map((elem) => elem.id) : [];
      expect(arr).toEqual(['d', 'f', 'e']);
    });

    it('should find recursive predecessors array of a given node', () => {
      const node = g.node('d');
      const arr = !!node ? g.predecessors(node.id).map((elem) => elem.id) : [];
      expect(arr).toEqual(['c', 'a', 'g', 'e']);
    });

    it('should return all node successors recursively as layers - version 1', () => {
      expect(g.successorsLayers('a')).toEqual([['a'], ['b', 'c'], ['e'], ['d'], ['f']]);
    });

    it('should return all node successors recursively as layers - version 2', () => {
      let a = new Graph<NodeData, EdgeData>();
      a.setNode(new Node('a', new NodeData('a', 'comp1', '1.0.0')));
      a.setNode(new Node('b', new NodeData('b', 'comp2', '2.0.0')));
      a.setNode(new Node('c', new NodeData('c', 'comp3', '1.0.1')));
      a.setNode(new Node('d', new NodeData('d', 'comp4', '15.0.0')));
      a.setNode(new Node('e', new NodeData('e', 'comp5', '3.0.0')));
      a.setNode(new Node('f', new NodeData('f', 'comp6', '2.0.0')));
      a.setNode(new Node('g', new NodeData('g', 'comp7', '2.0.0')));
      a.setNode(new Node('h', new NodeData('h', 'comp8', '2.0.0')));

      a.setEdge(new Edge('a', 'b', new EdgeData('peer', 3)));
      a.setEdge(new Edge('a', 'g', new EdgeData('peer', 3)));
      a.setEdge(new Edge('b', 'c', new EdgeData('dev', 3)));
      a.setEdge(new Edge('b', 'f', new EdgeData('regular', 2)));
      a.setEdge(new Edge('c', 'e', new EdgeData('regular', 3)));
      a.setEdge(new Edge('c', 'd', new EdgeData('peer', 3)));
      a.setEdge(new Edge('d', 'f', new EdgeData('dev', 3)));
      a.setEdge(new Edge('f', 'g', new EdgeData('dev', 3)));
      a.setEdge(new Edge('e', 'h', new EdgeData('dev', 1)));
      expect(a.successorsLayers('a')).toEqual([['a'], ['b'], ['c'], ['e', 'd'], ['h', 'f'], ['g']]);
    });

    it('should return all node successors recursively as layers with edge filter function', () => {
      expect(g.successorsLayers('a', { edgeFilter: edgeFilterByDevDep })).toEqual([['a'], ['c']]);
    });

    it('should return all node successors recursively as layers with node filter function', () => {
      expect(g.successorsLayers('a', { nodeFilter: nodeFilterPredicateVersion })).toEqual([['a'], ['b']]);
    });

    it('should return all node predecessors recursively as layers - version 1', () => {
      expect(g.predecessorsLayers('d')).toEqual([['d'], ['e'], ['c'], ['a'], ['g']]);
    });

    it('should throw error for circular dependencies for successors as layers', () => {
      g.setEdge(new Edge('f', 'a', new EdgeData('regular', 3)));
      try {
        g.successorsLayers('a');
      } catch (e) {
        expect(e.message).toEqual('cyclic dependency');
        g.deleteEdge('f', 'a');
        return;
      }
      g.deleteEdge('f', 'a');
      // expect.fail('should have thrown exception');
    });

    it('should perform topological sort on the graph', () => {
      const res = g.toposort();
      const ids = res.map((elem) => (elem ? elem.id : ''));
      expect(ids).toEqual(['g', 'a', 'b', 'c', 'e', 'd', 'f']);
    });

    it('should perform topological sort on the graph and return reverse order', () => {
      const res = g.toposort(true);
      const ids = res.map((elem) => (elem ? elem.id : ''));
      expect(ids).toEqual(['f', 'd', 'e', 'c', 'b', 'a', 'g']);
    });

    it('should perform topological sort on graph with unconnected components', () => {
      g.deleteEdge('g', 'a');
      const res = g.toposort();
      const ids = res.map((elem) => (elem ? elem.id : ''));
      expect(ids).toEqual(['a', 'b', 'c', 'e', 'd', 'f', 'g']);
      g.setEdge(new Edge('g', 'a', new EdgeData('dev', 1)));
    });

    it('should throw cyclic dependencies error on topological sort given graph with cycles', () => {
      const f = function () {
        g.toposort();
      };
      g.setEdge(new Edge('f', 'g', new EdgeData('dev', 2)));
      expect(f).toThrow(CyclicError);
      g.deleteEdge('f', 'g');
    });

    it('should find all paths from one node to another', () => {
      g.setEdge(new Edge('a', 'd', new EdgeData('dev', 2)));
      g.setEdge(new Edge('e', 'f', new EdgeData('dev', 2)));
      expect(g.allPaths('a', 'd')).toEqual([
        ['a', 'c', 'd'],
        ['a', 'c', 'e', 'd'],
        ['a', 'd'],
      ]);
      g.deleteEdge('a', 'd');
      g.deleteEdge('e', 'f');
    });

    it('should return all cycles in graph', () => {
      g.setEdge(new Edge('c', 'g', new EdgeData('dev', 2)));
      g.setEdge(new Edge('f', 'e', new EdgeData('dev', 2)));
      const cycles = g.findCycles();
      expect(cycles).toEqual([
        ['e', 'f', 'd'],
        ['g', 'c', 'a'],
      ]);
      g.deleteEdge('c', 'g');
      g.deleteEdge('f', 'e');
    });

    it('should stringify graph', () => {
      const res = g.stringify();
      expect(res).toContain('"nodes":[{"id"');
      expect(res).toContain('"edges":[{"id"');
    });

    it('should convert graph to json object', () => {
      const res = g.toJson();
      expect(res.nodes.length).toEqual(7);
      expect(res.edges.length).toEqual(7);
    });

    it('should build graph from JSON', () => {
      const obj = {
        nodes: [
          { id: 'a', attr: { name: 'hello' } },
          { id: 'b', attr: { name: 'world' } },
        ],
        edges: [{ sourceId: 'a', targetId: 'b', attr: { lifecycle: 'peer' } }],
      };
      const stringified = JSON.stringify(obj);
      const newGraph = Graph.parse(stringified);
      expect([...newGraph.nodeMap.keys()]).toEqual(['a', 'b']);
      expect([...newGraph.edgeMap.keys()]).toEqual(['a->b']);
      // const str = newGraph.stringify();
      // const graphFromStr = Graph.parse(str);
    });
  });
});

describe('graph merge tester', () => {
  let h = new Graph<NodeData, EdgeData>();
  let i = new Graph<NodeData, EdgeData>();
  describe('creating graphs for merge', function () {
    h.setNode(new Node('a', new NodeData('a', 'comp17', '12.0.0')));
    h.setNode(new Node('h', new NodeData('h', 'comp20', '1.0.0')));
    h.setNode(new Node('i', new NodeData('i', 'comp11', '3.0.0')));
    h.setEdge(new Edge('a', 'h', new EdgeData('peer', 3)));
    h.setEdge(new Edge('i', 'h', new EdgeData('dev', 2)));

    i.setNode(new Node('a', new NodeData('a', 'comp34', '3.0.0')));
    i.setNode(new Node('j', new NodeData('j', 'comp53', '1.0.0')));
    i.setEdge(new Edge('j', 'a', new EdgeData('peer', 1)));
  });

  it('should merge graphs', () => {
    const res = g.merge([h, i]);
    expect(res.nodeMap.size).toEqual(10);
    expect(res.edgeMap.size).toEqual(10);
    expect(res.edgeMap.has('i->h')).toBeTruthy();
  });
});

function nodeFilterPredicateVersion(nodeData: Node<NodeData>) {
  return nodeData.attr.version === '2.0.0';
}

function nodeFilterPredicateComp(nodeData: Node<NodeData>) {
  return nodeData.attr.id === 'comp2';
}

function edgeFilterByRegularDep(edgeData: Edge<EdgeData>) {
  return edgeData.attr.dep === 'regular';
}

function edgeFilterByDevDep(edgeData: Edge<EdgeData>) {
  return edgeData.attr.dep === 'dev';
}

function edgeFilterByPeerDep(edgeData: Edge<EdgeData>) {
  return edgeData.attr.dep === 'peer';
}

function edgeFilterByPeerOrDevDep(edgeData: Edge<EdgeData>) {
  return edgeData.attr.dep === 'peer' || edgeData.attr.dep === 'dev';
}
