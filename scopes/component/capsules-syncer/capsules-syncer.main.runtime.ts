import { MainRuntime } from '@teambit/cli';
import DevFilesAspect, { DevFilesMain } from '@teambit/dev-files';
import { DependencyResolverMain, DependencyResolverAspect } from '@teambit/dependency-resolver';
import { CapsulesSyncerAspect } from './capsules-syncer.aspect';
import { CapsulesSyncerTask } from './capsules-syncer.task';

export class CapsulesSyncerMain {
  static runtime = MainRuntime;
  static dependencies = [
    DevFilesAspect,
    DependencyResolverAspect,
  ];

  constructor(
    /**
     * build task.
     */
    readonly task: CapsulesSyncerTask,

    private devFiles: DevFilesMain,
  ) {}

  static async provider(
    [devFiles, dependencyResolver]: [
      DevFilesMain,
      DependencyResolverMain,
    ],
  ) {
    const capsulesSyncer = new CapsulesSyncerMain(
      new CapsulesSyncerTask(CapsulesSyncerAspect.id, devFiles, dependencyResolver),
      devFiles,
    );

    return capsulesSyncer;
  }
}

CapsulesSyncerAspect.addRuntime(CapsulesSyncerMain);

