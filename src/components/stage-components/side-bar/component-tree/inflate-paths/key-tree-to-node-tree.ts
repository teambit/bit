import { TreeNode } from '../recursive-tree';
import { KeyTree } from './key-tree';

/** converts key tree to a full tree
 * @example
 * input: {
 *    'hello': {
 *      'hello/world': undefined
 *    }
 * }
 * output: {
 *  id: 'hello',
 *  children: [
 *    {
 *      id: 'hello/world',
 *      children: undefined,
 *    }
 *  ]
 * }
 */
export function keyTreeToNodeTree<Payload>(nodeId: string, children?: KeyTree): TreeNode<Payload> {
  // leaf:
  if (!children) {
    return {
      id: nodeId,
      children: undefined,
    };
  }

  // innerNode:
  return {
    id: nodeId,
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
