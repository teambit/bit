import { MainRuntime } from '@teambit/cli';
import PubsubAspect, { PubsubMain } from '@teambit/pubsub';

import path from 'path';
import execa from 'execa';
import { fork } from 'child_process';

import { WorkerAspect } from './worker.aspect';

export type SpawnOptions = {
  aspectId: string;
  execMethodName: string;
  params: Array<any>;
};

export class WorkerMain {
  constructor(private pubsub: PubsubMain) {}

  public spawn(options: SpawnOptions) {
    const boot = path.join(__dirname, './run-inside-the-worker/bootstrap.script');
    const forked = fork(boot, [JSON.stringify(options)], { silent: true });
    // const forked = fork(boot, [JSON.stringify(options)], { silent: false });
    this.pubsub.addProcess(forked);
  }

  static runtime = MainRuntime;

  static dependencies = [PubsubAspect];

  static async provider([pubsub]: [PubsubMain]) {
    return new WorkerMain(pubsub);
  }
}

WorkerAspect.addRuntime(WorkerMain);
