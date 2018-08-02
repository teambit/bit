/** @flow */
import Command from '../../command';
import { attachEnvs } from '../../../api/consumer';
import type { AttachResults } from '../../../consumer/component-ops/attach-envs';

export default class EnvsAttach extends Command {
  name = 'envs-attach [ids...]';
  description = 'attach workspace environments to components';
  alias = '';
  opts = [
    ['t', 'tester', 'attach workspace test environments to components'],
    ['c', 'compiler', 'attach workspace compiler environments to components']
  ];
  loader = true;
  migration = true;

  action(
    [ids]: [string[]],
    { compiler = false, tester = false }: { compiler: boolean, tester: boolean }
  ): Promise<AttachResults> {
    return attachEnvs(ids, { compiler, tester });
  }

  report(attachResults: AttachResults): string {
    const successAttached = attachResults.filter(result => result.attached);
    const successAttachedNames = successAttached.map(val => val.id.toString());

    return `the following components has been attached to the workspace environments:\n${successAttachedNames.join(
      '\n'
    )}`;
  }
}
