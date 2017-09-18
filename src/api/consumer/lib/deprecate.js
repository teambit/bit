/** @flow */
import groupArray from 'group-array';
import { loadConsumer } from '../../../consumer';
import { BitId } from '../../../bit-id';

export default (async function deprecate({ ids, remote }: { ids: string[], remote: boolean }): Promise<any> {
  const consumer = await loadConsumer();
  return consumer.deprecate(ids, remote);
});
