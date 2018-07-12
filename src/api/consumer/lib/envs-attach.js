/** @flow */

import { loadConsumer, Consumer } from '../../../consumer';
import GeneralError from '../../../error/general-error';
import attachEnvsForComponents from '../../../consumer/component-ops/attach-envs';
import type { AttachResults } from '../../../consumer/component-ops/attach-envs';

export default (async function attachEnvs(ids: string[]): Promise<AttachResults> {
  const consumer: Consumer = await loadConsumer();
  if (!ids || !ids.length) {
    throw new GeneralError('please specify at least one component id');
  }
  const attachResults = await attachEnvsForComponents(consumer, ids);
  await consumer.onDestroy();
  return attachResults;
});
