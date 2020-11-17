import { EdgeModel } from '../../query';

export function isRuntime(edge: EdgeModel) {
  return edge.dependencyLifecycleType === 'RUNTIME';
}

export function isAny(/* edge: EdgeModel */) {
  return true;
}

export function isRuntimeOrMine(myId: string) {
  return (edge: EdgeModel) => {
    return edge.dependencyLifecycleType === 'RUNTIME' || edge.sourceId === myId;
  };
}
