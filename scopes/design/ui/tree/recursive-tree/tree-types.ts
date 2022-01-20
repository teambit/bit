export type TreeLayerProps<Payload = any> = {
  childNodes: TreeNode<Payload>[];
  depth: number;
};

export type TreeNodeProps<Payload = any> = {
  node: TreeNode<Payload>;
  depth: number;
  TreeNode?: TreeNodeProps<Payload>;
};

export type TreeNode<Payload = any> = {
  id: string;
  children?: TreeNode<Payload>[];
  payload?: Payload;
};
