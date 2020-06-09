// eslint-disable-next-line max-classes-per-file
import _ from 'lodash';
import Command, { CommandOptions } from '../../command';
import { loadConsumerIfExist } from '../../../consumer';
import { capsuleIsolate } from '../../../api/consumer';
import { Capsule } from '../../../extensions/isolator/capsule';
import { Logger } from '../../../extensions/logger';
import { PackageManager } from '../../../extensions/package-manager';
import { Isolator } from '../../../extensions/isolator';
import { ListResults } from '../../../extensions/isolator/isolator';
import { render } from '../../../utils';
import { DEFAULT_PACKAGE_MANAGER } from '../../../constants';

export class CapsuleList extends Command {
  // first command is supposed to be the action and the rest is the bitIds
  name = 'capsule-list';
  description = `list all capsules`;
  alias = '';
  opts = [['j', 'json', 'json format']] as CommandOptions;
  loader = true;
  migration = true;

  async action(): Promise<ListResults[] | ListResults> {
    const consumer = await loadConsumerIfExist();
    if (!consumer) throw new Error('no consumer found');
    const logger = new Logger();
    const packageManager = new PackageManager(DEFAULT_PACKAGE_MANAGER, logger);
    // const capsule = await Capsule.provide();
    const isolatorExt = await Isolator.provide([packageManager]);
    return isolatorExt.list(consumer);
  }

  report(capsuleListByWorkspace: ListResults[] | ListResults, ...args): string {
    if (args[1].json) return JSON.stringify(capsuleListByWorkspace, null, '  ');
    return render(capsuleListByWorkspace);
  }
}

export class CapsuleCreate extends Command {
  name = 'capsule-create [path...]';
  description = `capsule`;
  alias = '';
  opts = [
    ['b', 'baseDir <name>', 'set base dir of all capsules'],
    ['a', 'alwaysNew', 'create new environment for capsule'],
    ['i', 'id <name>', 'reuse capsule of certain name'],
    ['d', 'installPackages', 'install packages in capsule with npm']
  ] as CommandOptions;
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
      capsuleIsolate(values, _.omitBy({ baseDir, installPackages, alwaysNew, name: id }, _.isNil))
    );
  }

  report(capsuleObj: { [bitId: string]: Capsule }): string {
    const createdCapsules = Object.values(capsuleObj).map(capsule => {
      return {
        bitId: capsule.component.id.toString(),
        wrkDir: capsule.wrkDir
      };
    });
    return render(createdCapsules);
  }
}
