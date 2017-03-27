const path = require('path');
const R = require('ramda');
const fs = require('fs-extra');

const buildComponentPath = (targetModuleDir, component) => {
  const { name, box, scope, version } = component;
  return path.join(targetModuleDir, box, name, scope, version);
};

function putRawComponentOnFS(components, targetModuleDir) {
  return Promise.all(
    components.map((c) => {
      return new Promise((resolve, reject) => {
        const componentDir = buildComponentPath(targetModuleDir, c);
        fs.ensureDir(componentDir, (err) => {
          if (err) reject(err);
          resolve();
        });
      });
    }),
  );
}

function modelComponent({ component, dependencies }, targetModuleDir) {
  const allComponents = R.concat([component], dependencies);
  return putRawComponentOnFS(allComponents, targetModuleDir)
  .then(() => console.log('TODO - put some glue code'));
}

module.exports = (componentDependenciesArr) => {
  const moduleName = 'bit-js/test-module';
  const bitJscontainingDir = path.join(__dirname, '..', '..', '..');
  const targetModuleDir = path.join(bitJscontainingDir, moduleName);

  return Promise.all(componentDependenciesArr.map(cd => modelComponent(cd, targetModuleDir)));
};
