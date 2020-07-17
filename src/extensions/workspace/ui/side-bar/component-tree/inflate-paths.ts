import { subPaths } from '@bit/bit.utils.fs.sub-paths';
import { TreeNode } from './recursive-tree';

type KeyTree = { [filePath: string]: KeyTree | undefined };

export function inflateToTree(paths: string[]) {
  const treeSkeleton = buildKeyTree(paths);

  const rootItems = Object.entries(treeSkeleton);
  if (rootItems.length === 1) {
    const [singleRootKey, singleRootNode] = rootItems[0];
    return keyTreeToNodeTree(singleRootKey, singleRootNode);
  }
  return keyTreeToNodeTree('', treeSkeleton);
}

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

function keyTreeToNodeTree(nodeId: string, children?: KeyTree): TreeNode {
  // leaf:
  if (!children) {
    return {
      id: nodeId,
      children: undefined,
      // payload: undefined,
    };
  }

  // innerNode:
  return {
    id: nodeId,
    children: Object.entries(children)
      .sort(alphabetically)
      .sort(foldersFirst)
      .map(([fullpath, subChildren]) => keyTreeToNodeTree(fullpath, subChildren)),
  };
}

function alphabetically([key1 /* node1 */]: [string, any], [key2 /* node2 */]: [string, any]) {
  return key1 < key2 ? -1 : 1;
}

function foldersFirst<T>([, /* key1 */ children1]: [string, T], [, /* key2 */ children2]: [string, T]) {
  return (children1 !== undefined ? -1 : 0) + (children2 !== undefined ? 1 : 0);
}
