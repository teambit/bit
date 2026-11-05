import { WorkerAspect } from './worker.aspect';

export { WorkerAspect };
export type { WorkerMain } from './worker.main.runtime';
export type { HarmonyWorker } from './harmony-worker';
// loading `expose` also sets comlink's proxy handler for node, which the worker host needs.
export { expose } from '@teambit/harmony.modules.worker-expose';
export default WorkerAspect;
