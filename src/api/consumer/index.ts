import diff from './lib//diff';
import { addMany, addOne as add } from './lib/add';
import { build, buildAll } from './lib/build';
import checkout from './lib/checkout';
import dependencyStatus from './lib/dependency_status';
import { deprecate, undeprecate } from './lib/deprecation';
import ejectAction from './lib/eject';
import exportAction, { registerDefaultScopeGetter } from './lib/export';
import fetch from './lib/fetch';
import getComponentLogs from './lib/get-component-logs';
import getConsumerComponent from './lib/get-consumer-component';
import getScopeComponent from './lib/get-scope-component';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import config from './lib/global-config';
import importAction from './lib/import';
import init from './lib/init';
import injectConf from './lib/inject-conf';
import installAction from './lib/install';
import isolate from './lib/isolate';
import lane from './lib/lane';
import link from './lib/link';
import { listScope } from './lib/list-scope';
import login from './lib/login';
import merge from './lib/merge';
import migrate from './lib/migrate';
import move from './lib/move';
import paintGraph from './lib/paint-graph';
import { add as remoteAdd, list as remoteList, remove as remoteRm } from './lib/remote';
import remove from './lib/remove';
import show from './lib/show';
import { snapAction } from './lib/snap';
import status from './lib/status';
import switchAction from './lib/switch';
import { tagAction } from './lib/tag';
import test from './lib/test';
import unTagAction from './lib/untag';
import untrack from './lib/untrack';
import { clearCache } from './lib/clear-cache';

export {
  init,
  isolate,
  config,
  exportAction,
  registerDefaultScopeGetter,
  remove,
  deprecate,
  undeprecate,
  buildAll,
  listScope,
  tagAction,
  snapAction,
  status,
  build,
  importAction,
  installAction,
  getConsumerComponent,
  getScopeComponent,
  getComponentLogs,
  test,
  remoteAdd,
  remoteList,
  remoteRm,
  add,
  addMany,
  dependencyStatus,
  untrack,
  unTagAction,
  move,
  link,
  checkout,
  merge,
  diff,
  injectConf,
  migrate,
  ejectAction,
  login,
  show,
  paintGraph,
  lane,
  switchAction,
  fetch,
  clearCache,
};
