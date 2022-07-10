import diff from './lib//diff';
import { addMany, addOne as add } from './lib/add';
import checkout from './lib/checkout';
import dependencyStatus from './lib/dependency_status';
import exportAction, { registerDefaultScopeGetter } from './lib/export';
import fetch from './lib/fetch';
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
import remove from './lib/remove';
import show from './lib/show';
import unTagAction from './lib/untag';
import { clearCache } from './lib/clear-cache';

export {
  init,
  config,
  exportAction,
  registerDefaultScopeGetter,
  remove,
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
  unTagAction,
  move,
  linkAction as link,
  checkout,
  diff,
  migrate,
  login,
  show,
  paintGraph,
  fetch,
  clearCache,
};
