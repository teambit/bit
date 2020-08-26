import { subPaths } from '@teambit/base-ui.utils.sub-paths';

export type KeyTree = {
  [filePath: string]: KeyTree | undefined;
};

/**
 * builds a skeleton of the tree.
 * @example
 * input: ['hello/world']
 * output: {
 *    'hello/': {
 *      'hello/world': undefined
 *    }
 * }
 */
export function buildKeyTree(paths: string[]): KeyTree {
  const treeRoot: KeyTree = {};

  paths.forEach((fullpath) => {
    const segments = subPaths(fullpath).filter((x) => x !== '.'); // @HACK!
    const isFolder = fullpath.endsWith('/');
    const fileName = isFolder ? undefined : segments.pop();

    let currentFolder = treeRoot;

    segments.forEach((dirname) => {
      const folderId = `${dirname}/`;
      const nextFolder = currentFolder[folderId] || makeNode();
      currentFolder[folderId] = nextFolder;
      currentFolder = nextFolder;
    });

    if (fileName && !(fileName in currentFolder)) {
      currentFolder[fileName] = undefined;
    }
  });

  return treeRoot;
}
function makeNode(): KeyTree {
  return Object.create(null);
}
