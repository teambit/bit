import init from './lib/init';
import isolate from './lib/isolate';
import remove from './lib/remove';
import { deprecate, undeprecate } from './lib/deprecation';
import { listScope } from './lib/list-scope';
import { tagAction, tagAllAction } from './lib/tag';
import status from './lib/status';
import { build, buildAll } from './lib/build';
import importAction from './lib/import';
import installAction from './lib/install';
import exportAction from './lib/export';
import getConsumerComponent from './lib/get-consumer-component';
import getScopeComponent from './lib/get-scope-component';
import test from './lib/test';
import getComponentLogs from './lib/get-component-logs';
import { add as remoteAdd, list as remoteList, remove as remoteRm } from './lib/remote';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import config from './lib/global-config';
import { addOne as add, addMany } from './lib/add';
import untrack from './lib/untrack';
import unTagAction from './lib/untag';
import move from './lib/move';
import link from './lib/link';
import checkout from './lib/checkout';
import merge from './lib/merge';
import diff from './lib//diff';
import injectConf from './lib/inject-conf';
import migrate from './lib/migrate';
import ejectAction from './lib/eject';
import dependencyStatus from './lib/dependency_status';
import login from './lib/login';
import show from './lib/show';
import paintGraph from './lib/paint-graph';

export {
  init,
  isolate,
  config,
  exportAction,
  remove,
  deprecate,
  undeprecate,
  buildAll,
  listScope,
  tagAction,
  tagAllAction,
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
  paintGraph
};
