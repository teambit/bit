import { join } from 'path';
import { MainRuntime } from '@teambit/cli';
import { ComponentAspect, ComponentMain } from '@teambit/component';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { WorkerAspect } from './worker.aspect';
import { HarmonyWorker } from './harmony-worker';

export type WorkerSlot = SlotRegistry<HarmonyWorker<unknown>>;

export type WorkerNameSlot = SlotRegistry<string>;

export class WorkerMain {
  constructor(
    private workerSlot: WorkerSlot,
    private componentAspect: ComponentMain,
    private pkg: PkgMain,
    private workerNameSlot: WorkerNameSlot
  ) {}

  static runtime = MainRuntime;

  listWorkers() {
    return this.workerSlot.values();
  }

  /**
   * create a new worker.
   */
  async declareWorker<T>(name: string, path: string) {
    this.workerNameSlot.register(name);

    const maybeAspectId = this.workerNameSlot.toArray().find(([, workerName]) => {
      return workerName === name;
    });

    if (!maybeAspectId) throw new Error(`could not create a worker ${name}`);
    // const scriptPath = path || await this.resolveWorkerScript(name, aspectId);
    const scriptPath = path;
    const systemWorker = new HarmonyWorker<T>(name, scriptPath);
    this.workerSlot.register(systemWorker);

    return systemWorker;
  }

  private async resolveWorkerScript(name: string, aspectId: string) {
    const host = this.componentAspect.getHost();
    const id = await host.resolveComponentId(aspectId);
    const component = await host.get(id);
    if (!component) throw new Error(`[worker] could not resolve component for aspect ID: ${aspectId}`);
    const packageName = this.pkg.getPackageName(component);
    // const workerFile = component.state.filesystem.files.find((file) => file.relative.includes(`${name}.worker`));
    // if (!workerFile) throw new Error(`[worker] aspect declaring a worker must contain a ${name}.worker. file`);
    return require.resolve(join(packageName, 'dist', `${name}.worker.js`));
  }

  getWorker<T>(id: string) {
    return this.workerSlot.get(id) as HarmonyWorker<T>;
  }

  static slots = [Slot.withType<HarmonyWorker<unknown>>(), Slot.withType<string>()];

  static dependencies = [ComponentAspect, PkgAspect];

  static async provider(
    [componentAspect, pkg]: [ComponentMain, PkgMain],
    config,
    [workerSlot, workerNameSlot]: [WorkerSlot, WorkerNameSlot]
  ) {
    return new WorkerMain(workerSlot, componentAspect, pkg, workerNameSlot);
  }
}

WorkerAspect.addRuntime(WorkerMain);
