import { MainRuntime } from '@teambit/cli';
// import { wrap } from 'comlink';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { WorkerAspect } from './worker.aspect';

export type HarmonyWorker = {};

export type WorkerSlot = SlotRegistry<HarmonyWorker>;

export class WorkerMain {
  constructor(private workerSlot: WorkerSlot) {}

  static runtime = MainRuntime;

  static slots = [Slot.withType<HarmonyWorker>()];

  static async provider(deps, config, [workerSlot]: [WorkerSlot]) {
    return new WorkerMain(workerSlot);
  }
}

WorkerAspect.addRuntime(WorkerMain);
