// @flow
import { Consumer } from '..';

export type AttachResult = { id: string, attached: boolean };
export type AttachResults = Array<AttachResult>;

export default (function attachEnvs(
  consumer: Consumer,
  ids: string[],
  { compiler, tester }: { compiler: boolean, tester: boolean }
): AttachResults {
  const results = ids.map((id) => {
    const attachRes = consumer.bitMap.attachEnv(id, { compiler, tester });
    return { id, attached: attachRes };
  });
  return results;
});
