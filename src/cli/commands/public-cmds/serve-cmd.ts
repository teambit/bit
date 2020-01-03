import chalk from 'chalk';
import _ from 'lodash';
import Command from '../../command';
import { capsuleIsolate } from '../../../api/consumer';
import BitCapsule from '../../../capsule/bit-capsule';

export default class Serve extends Command {
  name = 'serve [id]';
  description = `serves a ui component`;
  alias = '';
  opts = [];

  action([id]: [string], {}): Promise<any> {
    console.log('hi');
  }

  report(capsuleObj: { [bitId: string]: BitCapsule }): string {
    return Object.values(capsuleObj)
      .map(capsule => chalk.green(`${capsule.bitId.toString()}..........${capsule.wrkDir}\n`))
      .join('');
  }
}
