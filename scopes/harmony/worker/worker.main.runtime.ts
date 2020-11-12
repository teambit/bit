import { MainRuntime } from '@teambit/cli';
import PubsubAspect, { PubsubMain } from '@teambit/pubsub';

import path from 'path';
// import execa from 'execa';
import { fork } from 'child_process';

import { WorkerAspect } from './worker.aspect';

export type CreateWorkerOptions = {
  aspectId: string;
  execMethodName: string;
  params: Array<any>;
  silent?: boolean;
};

export class WorkerMain {
  constructor(private pubsub: PubsubMain) {}

  public createWorker(options: CreateWorkerOptions) {
    const boot = path.join(__dirname, './run-inside-the-worker/bootstrap.script');
    const silent = typeof options.silent == 'undefined' ? true : options.silent;

    const forked = fork(boot, [JSON.stringify(options)], { silent });
    this.pubsub.addProcess(forked);
  }

  static runtime = MainRuntime;

  static dependencies = [PubsubAspect];

  static async provider([pubsub]: [PubsubMain]) {
    return new WorkerMain(pubsub);
  }
}

WorkerAspect.addRuntime(WorkerMain);
