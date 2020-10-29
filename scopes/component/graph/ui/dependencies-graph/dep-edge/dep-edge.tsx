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
