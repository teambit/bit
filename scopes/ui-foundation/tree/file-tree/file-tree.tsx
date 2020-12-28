// import { ComponentModel } from '@teambit/component';
import React, { useMemo } from 'react';
// import { ComponentTreeContextProvider } from './component-tree-context';
import { inflateToTree /* , attachPayload */ } from '@teambit/tree.inflate-paths';
import { indentStyle } from '@teambit/tree.indent';
// import { PayloadType, ScopePayload } from './payload-type';
// import { TreeNodeContext, TreeNodeRenderer } from './recursive-tree';
import { RootNode } from '@teambit/tree.root-node';
import { TreeNodeContext } from '@teambit/tree.recursive-tree';
// import { DefaultTreeNodeRenderer } from './default-tree-node-renderer';

type FileTreeProps = {
  // onSelect?: (id: string, event?: React.MouseEvent) => void;
  // selected?: string;
  files: string[];
  TreeNode?: any; //TreeNodeRenderer<PayloadType>;
};

export function FileTree({
  files,
  // onSelect,
  // selected,
  TreeNode,
}: FileTreeProps) {
  // console.log("filres", files)
  const rootNode = useMemo(() => {
    const tree = inflateToTree(files, (c) => c);
    // console.log("tree", tree)
    // const payloadMap = calcPayload(files);

    // attachPayload(tree, payloadMap);

    return tree;
  }, [files]);
  // console.log("rootNode", rootNode)
  return (
    <div style={indentStyle(1)}>
      <TreeNodeContext.Provider value={TreeNode}>
        {/* <ComponentTreeContextProvider onSelect={onSelect} selected={selected}> */}
        <RootNode node={rootNode} depth={1} />
        {/* </ComponentTreeContextProvider> */}
      </TreeNodeContext.Provider>
    </div>
  );
}
