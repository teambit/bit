import initScope from './lib/scope-init';
import put from './lib/put';
import fetch from './lib/fetch';
import describeScope from './lib/describe-scope';
import catObject from './lib/cat-object';
import catComponent from './lib/cat-component';
import scopeList from './lib/scope-list';
import scopeShow from './lib/scope-show';
import buildInScope from './lib/build-in-scope';
import testInScope from './lib/test-in-scope';
import modifyCIProps from './lib/modify-ci-props';
import ciUpdateAction from './lib/ci-update-action';
import scopeConfig from './lib/scope-config';
import catScope from './lib/cat-scope';
import refreshScope from './lib/refresh-scope';
import remove from './lib/delete';
import latestVersions from './lib/latest-versions';
import { deprecate, undeprecate } from './lib/deprecation';

export {
  catObject,
  catComponent,
  describeScope,
  initScope,
  testInScope,
  buildInScope,
  put,
  scopeList,
  scopeShow,
  fetch,
  modifyCIProps,
  ciUpdateAction,
  scopeConfig,
  catScope,
  refreshScope,
  remove,
  deprecate,
  undeprecate,
  latestVersions
};
