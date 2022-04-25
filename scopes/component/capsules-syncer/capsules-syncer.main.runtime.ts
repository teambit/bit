import { MainRuntime } from '@teambit/cli';
import { DependencyResolverMain, DependencyResolverAspect } from '@teambit/dependency-resolver';
import { CapsulesSyncerAspect } from './capsules-syncer.aspect';
import { CapsulesSyncerTask } from './capsules-syncer.task';

export class CapsulesSyncerMain {
  static runtime = MainRuntime;
  static dependencies = [DependencyResolverAspect];

  constructor(
    /**
     * build task.
     */
    readonly task: CapsulesSyncerTask
  ) {}

  static async provider([dependencyResolver]: [DependencyResolverMain]) {
    const capsulesSyncer = new CapsulesSyncerMain(new CapsulesSyncerTask(CapsulesSyncerAspect.id, dependencyResolver));

    return capsulesSyncer;
  }
}

CapsulesSyncerAspect.addRuntime(CapsulesSyncerMain);
