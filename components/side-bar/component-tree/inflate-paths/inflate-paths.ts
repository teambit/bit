import { buildKeyTree } from './key-tree';
import { keyTreeToNodeTree } from './key-tree-to-node-tree';

type KeySelector<T> = (data: T) => string;

const multiRootNodeId = '';

export function inflateToTree<T, Payload = any>(rawData: T[], idSelector: KeySelector<T>) {
  const paths = rawData.map(idSelector);
  const treeSkeleton = buildKeyTree(paths);

  const rootItems = Object.entries(treeSkeleton);

  const [rootKey, rootNode] = rootItems.length === 1 ? rootItems[0] : [multiRootNodeId, treeSkeleton];
  const tree = keyTreeToNodeTree<Payload>(rootKey, rootNode);

  return tree;
}
