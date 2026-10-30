import { expect } from 'chai';
import GraphLib from 'graphlib';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { GraphCmd } from './graph-cmd';

const ids = ['scope/z@1', 'scope/A@1', 'scope/a@2', 'scope/a@1'];
const edges: Array<[string, string, string, boolean]> = [
  ['scope/z@1', 'scope/a@1', 'prod', false],
  ['scope/A@1', 'scope/z@1', 'ext', true],
  ['scope/a@1', 'scope/A@1', 'dev', false],
  ['scope/a@2', 'scope/z@1', 'peer', false],
];

function makeGraph(reverse = false) {
  const order = <T>(items: T[]) => (reverse ? [...items].reverse() : items);
  return new Graph(
    order(ids).map((id) => new Node(id, { originalId: id })),
    order(edges).map(([source, target, attr, bidirectional]) => new Edge(source, target, attr, bidirectional))
  );
}

function command(graph: Graph<any, any>, localIds = ids) {
  const calls: string[] = [];
  const host = {
    resolveComponentId: async (id: string) => {
      calls.push(id);
      return { toString: () => id };
    },
    listIds: async () => localIds.map((id) => ({ toString: () => id })),
  };
  const cmd = new GraphCmd({ getHost: () => host } as any, { getGraphIds: async () => graph } as any);
  return { cmd, calls };
}

describe('GraphCmd json output', () => {
  it('is byte-identical for different discovery orders and keeps every edge field', async () => {
    const graph = makeGraph();
    const original = JSON.stringify(graph.toJson());
    expect(original).to.not.equal(JSON.stringify(makeGraph(true).toJson()));

    const left = await command(graph).cmd.json([undefined as any], { includeDependencies: true });
    const right = await command(makeGraph(true)).cmd.json([undefined as any], { includeDependencies: true });
    expect(JSON.stringify(left)).to.equal(JSON.stringify(right));
    expect(left.nodes).to.deep.equal([...ids].sort());
    const expectedEdges = graph
      .toJson()
      .edges.slice()
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(left.edges).to.deep.equal(expectedEdges);
    expect(left.edges.some((edge) => edge.bidirectional)).to.equal(true);
    // only the CLI representation is ordered; the graph itself keeps its insertion order
    expect(JSON.stringify(graph.toJson())).to.equal(original);
  });

  it('keeps the default local-only membership with a stable order', async () => {
    const local = ['scope/z@1', 'scope/A@1'];
    const left = await command(makeGraph(), local).cmd.json([undefined as any], {});
    const right = await command(makeGraph(true), local).cmd.json([undefined as any], {});
    expect(JSON.stringify(left)).to.equal(JSON.stringify(right));
    expect(left.nodes).to.deep.equal([...local].sort());
    expect(left.edges).to.have.lengthOf(1);
    expect(left.edges[0].attr).to.equal('ext');
  });

  it('resolves an explicit component id and honors includeLocalOnly=false', async () => {
    const { cmd, calls } = command(makeGraph(), []);
    const result = await cmd.json(['scope/z@1'], { includeLocalOnly: false });
    expect(calls).to.deep.equal(['scope/z@1']);
    expect(result.nodes).to.have.lengthOf(4);
    expect(result.edges).to.have.lengthOf(4);
  });

  it('leaves the remote graphlib schema unchanged', async () => {
    const graph = new GraphLib.Graph({ directed: true, multigraph: true, compound: true });
    graph.setGraph({ layout: 'dot', label: 'remote' });
    graph.setNode('z', { label: 'Z' });
    graph.setNode('a', { label: 'A' });
    graph.setEdge('z', 'a', { dependencyType: 'peer' }, 'named-edge');
    const { cmd } = command(makeGraph());
    (cmd as any).generateGraphFromRemote = async () => graph;
    expect(await cmd.json([undefined as any], { remote: 'scope' })).to.deep.equal(GraphLib.json.write(graph));
  });
});
