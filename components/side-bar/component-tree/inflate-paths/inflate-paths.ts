import { attachPayload } from './attach-payload';
import { buildKeyTree } from './key-tree';
import { keyTreeToNodeTree } from './key-tree-to-node-tree';

type KeySelector<T> = (data: T) => string;
type PayloadSelector<T, Payload> = (data: T) => Payload;

const multiRootNodeId = '';

export function inflateToTree<T, Payload>(
  rawData: T[],
  idSelector: KeySelector<T>,
  payloadSelector?: PayloadSelector<T, Payload>
) {
  const paths = rawData.map(idSelector);
  const treeSkeleton = buildKeyTree(paths);

  const rootItems = Object.entries(treeSkeleton);

  const [rootKey, rootNode] = rootItems.length === 1 ? rootItems[0] : [multiRootNodeId, treeSkeleton];
  const tree = keyTreeToNodeTree<Payload>(rootKey, rootNode);

  if (payloadSelector) {
    const payloadMap = new Map(rawData.map((data) => [idSelector(data), payloadSelector(data)]));
    attachPayload(tree, payloadMap);
  }

  return tree;
}
