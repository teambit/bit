// @flow
import { Consumer } from '..';
import { BitId } from '../../bit-id';

export type AttachResult = { id: BitId, attached: boolean };
export type AttachResults = Array<AttachResult>;

export default (function attachEnvs(
  consumer: Consumer,
  ids: BitId[],
  { compiler, tester }: { compiler: boolean, tester: boolean }
): AttachResults {
  const results = ids.map((id) => {
    const attachRes = consumer.bitMap.attachEnv(id, { compiler, tester });
    return { id, attached: attachRes };
  });
  return results;
});
