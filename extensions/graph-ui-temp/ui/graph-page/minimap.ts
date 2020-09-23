import { Node } from 'react-flow-renderer';
import { rootNodeColor, defaultNodeColor } from '../component-node';

export function calcMinimapColors(node: Node) {
  const type = node.data?.type;

  switch (type) {
    case 'root':
      return rootNodeColor;
    default:
      return defaultNodeColor;
  }
}
