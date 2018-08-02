/** @flow */

import { loadConsumer, Consumer } from '../../../consumer';
import GeneralError from '../../../error/general-error';
import attachEnvsForComponents from '../../../consumer/component-ops/attach-envs';
import type { AttachResults } from '../../../consumer/component-ops/attach-envs';

export default (async function attachEnvs(
  ids: string[],
  { compiler, tester }: { compiler: boolean, tester: boolean }
): Promise<AttachResults> {
  if (!ids || !ids.length) {
    throw new GeneralError('please specify at least one component id');
  }
  if (!compiler && !tester) {
    throw new GeneralError('please specify at least one env type (--compiler / --tester)');
  }
  const consumer: Consumer = await loadConsumer();
  const bitIds = ids.map(id => consumer.getParsedId(id));
  const attachResults = attachEnvsForComponents(consumer, bitIds, { compiler, tester });
  await consumer.onDestroy();
  return attachResults;
});
