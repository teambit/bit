import { EdgeType } from '@teambit/graph';
import edgeStyles from './edge.module.scss';

export function depTypeToClass(depType: string) {
  switch (depType) {
    case 'DEV':
      return edgeStyles.dev;
    case 'PEER':
      return edgeStyles.peer;
    case 'RUNTIME':
      return edgeStyles.runtime;
    default:
      return undefined;
  }
}

export function depTypeToLabel(type: EdgeType) {
  switch (type) {
    case EdgeType.peer:
      return 'Peer Dependency';
    case EdgeType.dev:
      return 'Development Dependency';
    case EdgeType.runtime:
      return 'Dependency';
    default:
      return (type as string).toLowerCase();
  }
}
