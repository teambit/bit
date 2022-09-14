import diff from './lib//diff';
import { addMany, addOne as add } from './lib/add';
import dependencyStatus from './lib/dependency_status';
import getComponentLogs from './lib/get-component-logs';
import getConsumerComponent from './lib/get-consumer-component';
import getScopeComponent from './lib/get-scope-component';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import config from './lib/global-config';
import init from './lib/init';
import linkAction from './lib/link';
import { listScope } from './lib/list-scope';
import login from './lib/login';
import migrate from './lib/migrate';
import move from './lib/move';
import paintGraph from './lib/paint-graph';
import { add as remoteAdd, list as remoteList, remove as remoteRm } from './lib/remote';
import show from './lib/show';
import { clearCache } from './lib/clear-cache';

export {
  init,
  config,
  listScope,
  getConsumerComponent,
  getScopeComponent,
  getComponentLogs,
  remoteAdd,
  remoteList,
  remoteRm,
  add,
  addMany,
  dependencyStatus,
  move,
  linkAction as link,
  diff,
  migrate,
  login,
  show,
  paintGraph,
  clearCache,
};
