import { TreeNode } from '../recursive-tree';

export function attachPayload<Payload>(node: TreeNode<Payload>, payloadMap: Map<string, Payload>) {
  if (!node) return;
  node.payload = payloadMap.get(node.id);

  if (node.children) {
    node.children.forEach((x) => attachPayload(x, payloadMap));
  }
}
