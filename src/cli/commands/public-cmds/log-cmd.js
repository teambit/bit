/** @flow */
import R from 'ramda';
import Command from '../../command';
import { getComponentLogs } from '../../../api/consumer';
import { paintLog } from '../../chalk-box';

export default class Show extends Command {
  name = 'log <id>';
  description = 'log a component version messages';
  alias = '';
  opts = [];
  
  action([id, ]: [string]): Promise<*> {  
    return getComponentLogs(id)
    .then(logs => 
      R.reverse(R.values(logs))
      .map(R.evolve(
        {
          date: n => new Date(parseInt(n)).toLocaleString()
        }
      ))
    );
  }

  report(logs: Array<{
    message: string,
    hash: string,
    date: string,
    username: ?string,
    email: ?string
  }>): string {
    return logs.map(paintLog).join('\n');
  }
}
