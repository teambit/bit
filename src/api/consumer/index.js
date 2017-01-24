import init from './lib/init';
import create from './lib/create';
import remove from './lib/remove';
import listInline from './lib/list-inline';
import listScope from './lib/list-scope';
import commitAction from './lib/commit';
import status from './lib/status';
import buildInline from './lib/build-inline';
import modify from './lib/modify';
import importAction from './lib/import';
import exportAction from './lib/export';
import getInlineBit from './lib/get-inline-bit';
import getScopeBit from './lib/get-scope-bit';
import testInline from './lib/test-inline';
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
  buildInline,
  modify,
  importAction,
  getInlineBit,
  getScopeBit,
  getComponentLogs,
  testInline,
  remoteAdd,
  remoteList,
  remoteRm
};
