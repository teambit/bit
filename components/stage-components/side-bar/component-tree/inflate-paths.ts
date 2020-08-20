import { subPaths } from '@teambit/utils-temp.utils.sub-paths';
import { TreeNode } from './recursive-tree';

type KeyTree = { [filePath: string]: KeyTree | undefined };
type KeySelector<T> = (data: T) => string;
type PayloadSelector<T, Payload> = (data: T) => Payload;

const multiRootNodeId = '';

export function inflateToTree<T, Payload>(
  rawData: T[],
  idSelector: KeySelector<T>,
  payloadSelector: PayloadSelector<T, Payload>
) {
  const paths = rawData.map(idSelector);
  const treeSkeleton = buildKeyTree(paths);

  const payloadMap = new Map(rawData.map((data) => [idSelector(data), payloadSelector(data)]));

  const rootItems = Object.entries(treeSkeleton);

  const [rootKey, rootNode] = rootItems.length === 1 ? rootItems[0] : [multiRootNodeId, treeSkeleton];
  const tree = keyTreeToNodeTree<Payload>(rootKey, rootNode);
  attachPayload(tree, payloadMap);

  return tree;
}

/**
 * builds a skeleton of the tree.
 * @example
 * input: ['hello/world']
 * output: {
 *    'hello': {
 *      'world': undefined
 *    }
 * }
 */
function buildKeyTree(paths: string[]): KeyTree {
  const treeRoot: KeyTree = {};

  paths.forEach((fullpath) => {
    const segments = subPaths(fullpath).filter((x) => x !== '.'); // @HACK!
    const fileName = segments.pop();

    let currentFolder = treeRoot;

    segments.forEach((dirname) => {
      const nextFolder = currentFolder[dirname] || {};
      currentFolder[dirname] = nextFolder;
      currentFolder = nextFolder;
    });

    if (!fileName) return;
    const isExisting = currentFolder[fileName];
    if (isExisting) return; // folders may repeat, do not override

    const isFolder = fullpath.endsWith('/');
    currentFolder[fileName] = isFolder ? {} : undefined;
  });

  return treeRoot;
}

function attachPayload<Payload>(node: TreeNode<Payload>, payloadMap: Map<string, Payload>) {
  if (!node) return;
  node.payload = payloadMap.get(node.id);

  if (node.children) {
    node.children.forEach((x) => attachPayload(x, payloadMap));
  }
}

/** converts key tree to a full tree
 * @example
 * input: {
 *    'hello': {
 *      'world': undefined
 *    }
 * }
 * output: {
 *  id: 'hello',
 *  children: [
 *    {
 *      id: 'world',
 *      children: undefined,
 *      payload: undefined
 *    }
 *  ]
 * }
 */
function keyTreeToNodeTree<Payload>(nodeId: string, children?: KeyTree): TreeNode<Payload> {
  // leaf:
  if (!children) {
    return {
      id: nodeId,
      payload: undefined,
      children: undefined,
    };
  }

  // innerNode:
  return {
    id: nodeId,
    payload: undefined,
    children: Object.entries(children)
      .sort(alphabetically)
      .sort(foldersFirst)
      .map(([fullpath, subChildren]) => keyTreeToNodeTree<Payload>(fullpath, subChildren)),
  };
}

function alphabetically([key1 /* node1 */]: [string, any], [key2 /* node2 */]: [string, any]) {
  return key1 < key2 ? -1 : 1;
}

function foldersFirst<T>([, /* key1 */ children1]: [string, T], [, /* key2 */ children2]: [string, T]) {
  return (children1 !== undefined ? -1 : 0) + (children2 !== undefined ? 1 : 0);
}
