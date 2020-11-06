import { MainRuntime } from '@teambit/cli';
import { WorkerAspect } from './worker.aspect';

export class WorkerMain {
  static runtime = MainRuntime;

  static async provider() {
    return new WorkerMain();
  }
}

WorkerAspect.addRuntime(WorkerMain);
