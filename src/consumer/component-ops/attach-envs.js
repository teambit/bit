// @flow
import fs from 'fs-extra';
import R from 'ramda';
import { BitId } from '../../bit-id';
import { linkComponentsToNodeModules, reLinkDependents } from '../../links';
import * as packageJson from '../component/package-json';
import GeneralError from '../../error/general-error';
import { Consumer } from '..';
import type { PathOsBasedRelative, PathOsBasedAbsolute } from '../../utils/path';
import type { PathChangeResult } from '../bit-map/bit-map';
import Component from '../component/consumer-component';
import moveSync from '../../utils/fs/move-sync';

export type AttachResult = { id: string, attached: boolean };
export type AttachResults = Array<AttachResult>;

export default (function attachEnvs(
  consumer: Consumer,
  ids: string[],
  { compiler, tester }: { compiler: boolean, tester: boolean }
): Promise<AttachResults> {
  const results = ids.map((id) => {
    const attachRes = consumer.bitMap.attachEnv(id, { compiler, tester });
    return { id, attached: attachRes };
  });
  return results;
});
