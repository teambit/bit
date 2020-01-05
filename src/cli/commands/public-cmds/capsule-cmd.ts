// eslint-disable-next-line max-classes-per-file
import _ from 'lodash';
import Command from '../../command';
import { capsuleIsolate, sshIntoCapsule } from '../../../api/consumer';
import BitCapsule from '../../../capsule/bit-capsule';
import capsuleOrchestrator from '../../../orchestrator/orchestrator';
import { ListResults } from '../../../orchestrator/types';
import { render } from '../../../utils';

export class CapsuleList extends Command {
  // first command is supposed to be the action and the rest is the bitIds
  name = 'capsule-list [workspace]';
  description = `list all capsule`;
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [['workspace', 'workspace<string>', 'list workspace capsules']];
  loader = true;
  migration = true;

  action([workspace]: [string]): Promise<ListResults[] | ListResults> {
    if (!capsuleOrchestrator) throw new Error(`can't run command in non consumer environment`);
    return capsuleOrchestrator.list(workspace);
  }

  report(capsuleListByWorkspace: ListResults[] | ListResults): string {
    return render(capsuleListByWorkspace);
  }
}
export class CapsuleSSH extends Command {
  // first command is supposed to be the action and the rest is the bitIds
  name = 'connect <capsule>';
  description = `connect to capsule`;
  alias = 'c';
  opts = [];
  loader = true;
  migration = true;

  action([capsule]: [string]): Promise<any[]> {
    if (!capsuleOrchestrator) throw new Error(`can't run command in non consumer environment`);
    return sshIntoCapsule(capsule);
  }

  report(capsuleListByWorkspace: ListResults[]): string {
    return '';
  }
}

export class CapsuleDescribe extends Command {
  // first command is supposed to be the action and the rest is the bitIds
  name = 'capsule-describe <capsule>';
  description = `describe capsule`;
  alias = 'd';
  opts = [];
  loader = true;
  migration = true;

  action([capsule]: [string]): Promise<any[]> {
    if (!capsuleOrchestrator) throw new Error(`can't run command in non consumer environment`);
    return capsuleOrchestrator.describe(capsule);
  }

  report(capsuleListByWorkspace: ListResults[]): string {
    return render(capsuleListByWorkspace);
  }
}

export class CapsuleCreate extends Command {
  name = 'capsule-create [path...]';
  description = `capsule`;
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    ['b', 'baseDir <name>', 'set base dir of all capsules'],
    ['a', 'alwaysNew', 'create new environment for capsule'],
    ['i', 'id <name>', 'reuse capsule of certain name'],
    ['d', 'installPackages', 'install packages in capsule with npm']
  ];
  loader = true;
  migration = true;

  action(
    [values]: [string[]],
    {
      baseDir,
      alwaysNew = false,
      id,
      installPackages = false
    }: {
      baseDir: string | null | undefined;
      alwaysNew: boolean;
      id: string;
      installPackages: boolean;
    }
  ): Promise<any> {
    return Promise.resolve(
      capsuleIsolate(
        values,
        _.omitBy({ baseDir, installPackages }, _.isNil),
        _.omitBy({ alwaysNew, name: id }, _.isNil)
      )
    );
  }

  report(capsuleObj: { [bitId: string]: BitCapsule }): string {
    const createdCapsules = Object.values(capsuleObj).map(capsule => {
      return {
        bitId: capsule.bitId.toString(),
        wrkDir: capsule.wrkDir
      };
    });
    return render(createdCapsules);
  }
}
/* export default class Capsule extends Command {
  name = 'capsule';
  description = ``;
  alias = '';
  // @ts-ignore
  commands = [];
  subCommands=[new CapsuleCreate(), new CapsuleList(), new CapsuleDescribe()]
  opts = [];
  migration = false;

  action(): Promise<any> {
    return Promise.resolve()
  }

  report(conf: { [key: string]: string }): string {
    return '';
  }


} */
