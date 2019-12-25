import chalk from 'chalk';
import _ from 'lodash';
import Command from '../../command';
import { capsuleIsolate } from '../../../api/consumer';
import BitCapsule from '../../../capsule/bit-capsule';

/* export class CapsuleList extends Command {
  // first command is supposed to be the action and the rest is the bitIds
  name = 'list <workspace>';
  description = `list all capsule`;
  alias = '';
  opts = [];
  loader = true;
  migration = true;

  action(workspace: string): Promise<any[]> {
    return capsuleOrchestrator.list().then(res => res.flat());
  }

  report(list: any): string {
    return chalk.green('added configuration successfully');
  }
} */

export default class Capsule extends Command {
  // first command is supposed to be the action and the rest is the bitIds
  name = 'capsule [values...]';
  description = `capsule`;
  alias = '';
  // commands = [new CapsuleList()];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!

  opts = [
    ['b', 'baseDir <name>', 'set base dir of all capsules'],
    ['n', 'newCapsule', 'create new environment for capsule'],
    ['h', 'hash <string>', 'reuse capsule of certain hash'],
    ['i', 'installPackages', 'install packages in capsule with npm']
  ];
  loader = true;
  migration = true;

  action(
    [values]: [string[]],
    {
      baseDir,
      newCapsule = false,
      hash,
      installPackages = false
    }: {
      baseDir: string | null | undefined;
      newCapsule: boolean;
      hash: string;
      installPackages: boolean;
    }
  ): Promise<any> {
    return Promise.resolve(
      capsuleIsolate(
        values,
        _.omitBy({ baseDir }, _.isNil),
        _.omitBy({ new: newCapsule, hash, installPackages }, _.isNil)
      )
    );
  }
  report(capsuleObj: { [bitId: string]: BitCapsule }): string {
    return Object.values(capsuleObj)
      .map(capsule => chalk.green(`${capsule.bitId.toString()}..........${capsule.wrkDir}\n`))
      .join('');
  }
}
