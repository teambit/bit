import type { Node } from 'reactflow';
import { rootNodeColor, defaultNodeColor, externalNodeColor } from '../component-node';

export function calcMinimapColors(node: Node) {
  const type = node.data?.type;

  switch (type) {
    case 'root':
      return rootNodeColor;
    case 'external':
      return externalNodeColor;
    default:
      return defaultNodeColor;
  }
}
