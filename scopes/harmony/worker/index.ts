import { WorkerAspect } from './worker.aspect';
import { setFunctionHandlers } from './expose';

setFunctionHandlers();

export { WorkerAspect };
export type { WorkerMain } from './worker.main.runtime';
export type { HarmonyWorker } from './harmony-worker';
export { expose } from './expose';
export default WorkerAspect;
