import { setFunctionHandlers } from '@teambit/harmony.modules.worker-expose';
import { WorkerAspect } from './worker.aspect';

setFunctionHandlers();

export { WorkerAspect };
export type { WorkerMain } from './worker.main.runtime';
export type { HarmonyWorker } from './harmony-worker';
export { expose } from '@teambit/harmony.modules.worker-expose';
export default WorkerAspect;
