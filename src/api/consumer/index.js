import init from './lib/init';
import create from './lib/create';
import remove from './lib/remove';
import listInline from './lib/list-inline';
import listScope from './lib/list-scope';
import commitAction from './lib/commit';
import status from './lib/status';
import build from './lib/build';
import modify from './lib/modify';
import importAction from './lib/import';
import exportAction from './lib/export';
import getInlineBit from './lib/get-inline-bit';
import getScopeBit from './lib/get-scope-bit';
import test from './lib/test';
import getComponentLogs from './lib/get-component-logs';
import { add as remoteAdd, list as remoteList, remove as remoteRm } from './lib/remote';
import config from './lib/global-config';

export {
  init,
  config,
  exportAction,
  create,
  remove,
  listInline,
  listScope,
  commitAction,
  status,
  build,
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
