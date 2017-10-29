import 'regenerator-runtime/runtime';
// import { bindAction, bindSpecificComponentsAction } from './actions';
import { getDependencyTree } from './dependency-builder';
import { pack } from './pack';
import PackageJson from './package-json/package-json';

// const lifecycleHooks = {
//   onCreate: bindAction,
//   onCommit: bindAction,
//   onImport: bindAction,
//   onExport: bindAction,
//   onModify: bindAction,
//   onBuild: bindAction,
// };

module.exports = {
  // lifecycleHooks,
  // bind: bindAction,
  // bindSpecificComponents: bindSpecificComponentsAction,
  getDependencyTree,
  PackageJson,
  pack,
};

