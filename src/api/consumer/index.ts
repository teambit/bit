import diff from './lib//diff';
import dependencyStatus from './lib/dependency_status';
import getComponentLogs from './lib/get-component-logs';
import getConsumerComponent from './lib/get-consumer-component';
import getScopeComponent from './lib/get-scope-component';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import config from './lib/global-config';
import init from './lib/init';
import { listScope } from './lib/list-scope';
import login from './lib/login';
import migrate from './lib/migrate';
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
  dependencyStatus,
  diff,
  migrate,
  login,
  show,
  clearCache,
};
