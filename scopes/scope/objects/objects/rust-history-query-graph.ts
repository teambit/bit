import { types } from 'util';
import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import type VersionHistory from '../models/version-history';
import type { VersionHistoryGraph } from '../models/version-history';
import type ModelComponent from '../models/model-component';
import type Repository from './repository';
import type Ref from './ref';
import {
  hasRustSnapshotTransactionClass,
  hasRustSnapshotFunctions,
  hasRustSnapshotTransactionClassConstructor,
  registerRustSnapshotTransactionClass,
  registerRustSnapshotFunctions,
} from './rust-snapshot-guards';
import { captureRustHistoryQuery, isRustHistoryQueryOperation, requestRustHistoryQuery } from './rust-history-query';

const plannedOrders = new WeakMap<object, { order: number[]; fingerprint: string; aliases: object[] }>();

/** Register from the module that first constructs the canonical history graph. */
export function registerRustHistoryQueryGraphDefaults(graph: any, node: any, edge: any, lodash: object): void {
  registerRustSnapshotTransactionClass('HistoryQueryGraph', graph);
  registerRustSnapshotTransactionClass('HistoryQueryGraphNode', node);
  registerRustSnapshotTransactionClass('HistoryQueryGraphEdge', edge);
  registerRustSnapshotTransactionClass('HistoryQueryMap', Map);
  registerRustSnapshotFunctions('HistoryQueryGraphLodash', lodash, ['compact', 'uniqBy']);
}

function ordinary(value: unknown, name: string): boolean {
  return Boolean(
    value && typeof value === 'object' && !types.isProxy(value) && hasRustSnapshotTransactionClass(value, name)
  );
}

function canConstructHistoryGraph(): boolean {
  return hasRustSnapshotFunctions(['HistoryQueryGraphLodash']) &&
    hasRustSnapshotTransactionClassConstructor('HistoryQueryGraph', Graph) &&
    hasRustSnapshotTransactionClassConstructor('HistoryQueryGraphNode', Node) &&
    hasRustSnapshotTransactionClassConstructor('HistoryQueryGraphEdge', Edge) &&
    hasRustSnapshotTransactionClassConstructor('HistoryQueryMap', Map);
}

function capture<N, E>(graph: Graph<N, E>) {
  if (!ordinary(graph, 'HistoryQueryGraph') || !hasRustSnapshotFunctions(['HistoryQueryGraphLodash'])) return undefined;
  const fields = Object.getOwnPropertyDescriptors(graph);
  const nodesMap = fields._nodes?.value;
  const edgesMap = fields._edges?.value;
  if (!ordinary(nodesMap, 'HistoryQueryMap') || !ordinary(edgesMap, 'HistoryQueryMap')) return undefined;
  const nodes: Array<Node<N>> = [];
  const ids: string[] = [];
  const edges: Array<{ source: string; target: string }> = [];
  const aliases: object[] = [nodesMap, edgesMap];
  let valid = true;
  Map.prototype.forEach.call(nodesMap, (node: Node<N>, key: unknown) => {
    if (!ordinary(node, 'HistoryQueryGraphNode')) {
      valid = false;
      return;
    }
    const id = Object.getOwnPropertyDescriptor(node, 'id')?.value;
    if (typeof id !== 'string' || id !== key || id.length > 4096) valid = false;
    nodes.push(node);
    ids.push(id);
    aliases.push(node);
  });
  Map.prototype.forEach.call(edgesMap, (edge: object, key: unknown) => {
    if (!ordinary(edge, 'HistoryQueryGraphEdge')) {
      valid = false;
      return;
    }
    const descriptors = Object.getOwnPropertyDescriptors(edge);
    const source = descriptors.sourceId?.value;
    const target = descriptors.targetId?.value;
    if (typeof source !== 'string' || typeof target !== 'string' || key !== `${source}->${target}`) valid = false;
    edges.push({ source, target });
    aliases.push(edge);
  });
  if (!valid || ids.length > 4096 || edges.length > 16384) return undefined;
  return { nodes, aliases, input: { kind: 'historyQueryToposort', nodes: ids, edges } };
}

/** A declined plan sorts the same observed graph; graph discovery callbacks are never repeated. */
export async function getRustHistoryQueryGraphOrder<N, E>(graph: Graph<N, E>): Promise<Array<Node<N>> | undefined> {
  if (!isRustHistoryQueryOperation()) return undefined;
  const before = capture(graph);
  if (!before) return undefined;
  const fingerprint = JSON.stringify(before.input);
  const planned = plannedOrders.get(graph);
  if (
    planned &&
    planned.fingerprint === fingerprint &&
    planned.aliases.length === before.aliases.length &&
    planned.aliases.every((alias, index) => alias === before.aliases[index])
  ) {
    return planned.order.map((index) => before.nodes[index]);
  }
  const result = await requestRustHistoryQuery<{ order: number[] }>(before.input, (data) => {
    if (!Array.isArray(data?.order) || data.order.length !== before.nodes.length) return false;
    const seen = new Set<number>();
    for (const index of data.order) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= before.nodes.length || seen.has(index)) return false;
      seen.add(index);
    }
    return true;
  });
  if (!result) return undefined;
  const after = capture(graph);
  if (
    !after ||
    JSON.stringify(after.input) !== fingerprint ||
    after.aliases.length !== before.aliases.length ||
    after.aliases.some((alias, index) => alias !== before.aliases[index])
  )
    return undefined;
  return result.order.map((index) => before.nodes[index]);
}

type HistoryGraphRow = { hash: string; parents: string[]; squashed?: string[]; unrelated?: string };
type HistoryGraphResult = {
  hashes: string[];
  nodes: Array<{ id: string; index: number }>;
  edges: Array<{ source: string; target: string; type: string }>;
  order: number[];
};

function captureVersions(history: VersionHistory, limit?: number) {
  if (
    !ordinary(history, 'VersionHistory') ||
    !hasRustSnapshotFunctions(['SnapshotHistoryObject']) ||
    (limit !== undefined && (!Number.isSafeInteger(limit) || Math.abs(limit) > 4096))
  )
    return undefined;
  const map = Object.getOwnPropertyDescriptor(history, 'versionsObj')?.value;
  if (!map || types.isProxy(map) || ![Object.prototype, null].includes(Object.getPrototypeOf(map))) return undefined;
  const mapFields = Object.getOwnPropertyDescriptors(map);
  const keys = Reflect.ownKeys(mapFields);
  if (keys.length > 4096 || keys.some((key) => typeof key !== 'string' || !('value' in Reflect.get(mapFields, key))))
    return undefined;
  const all = Object.values(mapFields)
    .filter((field) => field.enumerable)
    .map((field) => field.value);
  const selected = limit ? all.slice(-limit) : all;
  const rows: HistoryGraphRow[] = [];
  const refs = new Map<string, Ref>();
  const aliases: object[] = [map];
  const reference = (ref: Ref): string | undefined => {
    if (!ordinary(ref, 'Ref')) return undefined;
    const hash = Object.getOwnPropertyDescriptor(ref, 'hash')?.value;
    if (typeof hash !== 'string' || !/^[a-f0-9]{40}$/.test(hash)) return undefined;
    if (!refs.has(hash)) refs.set(hash, ref);
    aliases.push(ref);
    return hash;
  };
  const references = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value) || !ordinary(value, 'Array') || value.length > 4096) return undefined;
    const fields = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(fields).length !== value.length + 1) return undefined;
    const result: string[] = [];
    aliases.push(value);
    for (let index = 0; index < value.length; index++) {
      const ref = fields[index]?.value;
      const hash = reference(ref);
      if (!hash) return undefined;
      result.push(hash);
    }
    return result;
  };
  for (const row of selected) {
    if (!row || types.isProxy(row) || Object.getPrototypeOf(row) !== Object.prototype) return undefined;
    const fields = Object.getOwnPropertyDescriptors(row);
    if (Reflect.ownKeys(fields).some((key) => !('value' in Reflect.get(fields, key)))) return undefined;
    aliases.push(row);
    const hash = reference(fields.hash?.value);
    const parents = references(fields.parents?.value);
    const squashed = fields.squashed?.value == null ? undefined : references(fields.squashed.value);
    const unrelated = fields.unrelated?.value == null ? undefined : reference(fields.unrelated.value);
    if (
      !hash ||
      !parents ||
      (fields.squashed?.value != null && !squashed) ||
      (fields.unrelated?.value != null && !unrelated)
    )
      return undefined;
    rows.push({ hash, parents, ...(squashed ? { squashed } : {}), ...(unrelated ? { unrelated } : {}) });
  }
  if (refs.size > 4096) return undefined;
  return { rows, refs, aliases };
}

function capturePointers(heads: { [hash: string]: string[] }) {
  if (!heads || types.isProxy(heads) || Object.getPrototypeOf(heads) !== Object.prototype) return undefined;
  const fields = Object.getOwnPropertyDescriptors(heads);
  const values: Array<{ key: string; value: string[]; fingerprint: string }> = [];
  for (const key of Reflect.ownKeys(fields)) {
    const field = Reflect.get(fields, key) as PropertyDescriptor;
    if (typeof key !== 'string' || !/^[a-f0-9]{40}$/.test(key) || !('value' in field)) return undefined;
    const value = field.value;
    if (!Array.isArray(value) || !ordinary(value, 'Array') || value.length > 4096) return undefined;
    const entries = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(entries).length !== value.length + 1) return undefined;
    for (let index = 0; index < value.length; index++) if (typeof entries[index]?.value !== 'string') return undefined;
    values.push({ key, value, fingerprint: JSON.stringify(value) });
  }
  return values;
}

/** Rust owns graph membership, edge precedence and ranking; Node hydrates the public graph classes. */
export async function getRustHistoryQueryHistoryGraph(
  history: VersionHistory,
  model: ModelComponent,
  repository: Repository,
  heads: { [hash: string]: string[] },
  shortHash = false,
  limit?: number
): Promise<VersionHistoryGraph | undefined> {
  if (
    !isRustHistoryQueryOperation() ||
    !canConstructHistoryGraph()
  )
    return undefined;
  const metadata = captureRustHistoryQuery(repository, model);
  const versions = captureVersions(history, limit);
  const pointers = capturePointers(heads);
  if (!metadata || !versions || !pointers) return undefined;
  const expectedHashes = [...versions.refs.keys()];
  const expectedNodes = new Map<string, number>();
  expectedHashes.forEach((hash, index) => expectedNodes.set(shortHash ? hash.slice(0, 9) : hash, index));
  const input = { kind: 'historyQueryShow', versions: versions.rows, shortHash };
  const result = await requestRustHistoryQuery<HistoryGraphResult>(input, (data) => {
    if (
      !Array.isArray(data?.hashes) ||
      JSON.stringify(data.hashes) !== JSON.stringify(expectedHashes) ||
      !Array.isArray(data.nodes) ||
      data.nodes.length !== expectedNodes.size ||
      !Array.isArray(data.edges) ||
      data.edges.length > 16384 ||
      !Array.isArray(data.order)
    )
      return false;
    const ids = new Set<string>();
    for (const node of data.nodes) {
      if (
        !Number.isSafeInteger(node.index) ||
        node.index < 0 ||
        node.index >= data.hashes.length ||
        node.id !== (shortHash ? data.hashes[node.index].slice(0, 9) : data.hashes[node.index]) ||
        expectedNodes.get(node.id) !== node.index ||
        ids.has(node.id)
      )
        return false;
      ids.add(node.id);
    }
    if (
      data.edges.some(
        (edge) =>
          !ids.has(edge.source) || !ids.has(edge.target) || !['parent', 'unrelated', 'squashed'].includes(edge.type)
      )
    )
      return false;
    return (
      data.order.length === data.nodes.length &&
      new Set(data.order).size === data.nodes.length &&
      data.order.every((index) => Number.isSafeInteger(index) && index >= 0 && index < data.nodes.length)
    );
  });
  if (!result || !canConstructHistoryGraph() || !metadata.fresh()) return undefined;
  const after = captureVersions(history, limit);
  const afterPointers = capturePointers(heads);
  if (
    !after ||
    JSON.stringify(after.rows) !== JSON.stringify(versions.rows) ||
    after.aliases.length !== versions.aliases.length ||
    after.aliases.some((alias, index) => alias !== versions.aliases[index]) ||
    !afterPointers ||
    afterPointers.length !== pointers.length ||
    afterPointers.some(
      (value, index) =>
        value.key !== pointers[index].key ||
        value.value !== pointers[index].value ||
        value.fingerprint !== pointers[index].fingerprint
    )
  )
    return undefined;
  const attributes = result.hashes.map((hash) => ({
    tag: model.getTagOfRefIfExists(versions.refs.get(hash)!),
    pointers: heads[hash],
  }));
  const graph: VersionHistoryGraph = new Graph();
  graph.setNodes(result.nodes.map((node) => new Node(node.id, attributes[node.index])));
  graph.setEdges(result.edges.map((edge) => new Edge(edge.source, edge.target, edge.type)));
  const captured = capture(graph);
  if (captured)
    plannedOrders.set(graph, {
      order: result.order,
      fingerprint: JSON.stringify(captured.input),
      aliases: captured.aliases,
    });
  return graph;
}
