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

export type AttachResult = { id: BitId, attached: boolean };
export type AttachResults = Array<AttachResult>;

export default (async function attachEnvs(consumer: Consumer, ids: string[]): Promise<AttachResults> {
  return Promise.resolve([{ id: 'sss', attached: true }, { id: 'ssaaas', attached: false }]);
});
