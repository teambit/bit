import init from './lib/init';
import create from './lib/create';
import remove from './lib/remove';
import listInline from './lib/list-inline';
import listScope from './lib/list-scope';
import commitAction from './lib/commit';
import status from './lib/status';
import build from './lib/build';
import prepare from './lib/prepare';
import initScope from './lib/scope-init';
import put from './lib/put';
import fetch from './lib/fetch';
import modify from './lib/modify';
import importAction from './lib/import';
import exportAction from './lib/export';
import getInlineBit from './lib/get-inline-bit';
import getScopeBit from './lib/get-scope-bit';
import test from './lib/test';
import describeScope from './lib/describe-scope';
import catObject from './lib/cat-object';
import getComponentLogs from './lib/get-component-logs';

import { add as remoteAdd, list as remoteList, remove as remoteRm } from './lib/remote';

export {
  init,
  exportAction,
  create,
  catObject,
  describeScope,
  remove,
  listInline,
  listScope,
  commitAction,
  status,
  build,
  prepare,
  initScope,
  put,
  fetch,
  modify,
  importAction,
  getInlineBit,
  getScopeBit,
  getComponentLogs,
  test,
  remoteAdd,
  remoteList,
  remoteRm
};
