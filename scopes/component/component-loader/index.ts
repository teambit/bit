import { ComponentLoaderAspect } from './component-loader.aspect';

export type { ComponentLoaderMain } from './component-loader.main.runtime';

export type { Phase } from './phase';
export { PHASES, phaseRank, isPhaseAtLeast, DEFAULT_PHASE } from './phase';

export type { LoadEvent, LoadEventListener } from './load-events';
export { LoadEventEmitter } from './load-events';

export { ComponentNotFound } from './component-not-found';

export default ComponentLoaderAspect;
export { ComponentLoaderAspect };
