import { DependencyLifecycleType } from '.';

export const RUNTIME_DEP_LIFECYCLE_TYPE: DependencyLifecycleType = 'runtime';
export const DEV_DEP_LIFECYCLE_TYPE: DependencyLifecycleType = 'dev';
export const PEER_DEP_LIFECYCLE_TYPE: DependencyLifecycleType = 'peer';

export const ROOT_NAME = 'workspace';

export const LIFECYCLE_TYPE_BY_KEY_NAME = {
  dependencies: RUNTIME_DEP_LIFECYCLE_TYPE,
  devDependencies: DEV_DEP_LIFECYCLE_TYPE,
  peerDependencies: PEER_DEP_LIFECYCLE_TYPE,
};

export const KEY_NAME_BY_LIFECYCLE_TYPE = {
  [RUNTIME_DEP_LIFECYCLE_TYPE]: 'dependencies',
  [DEV_DEP_LIFECYCLE_TYPE]: 'devDependencies',
  [PEER_DEP_LIFECYCLE_TYPE]: 'peerDependencies',
};
