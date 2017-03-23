const R = require('ramda');
// const importComponents = require('bit-scope-client');
const componentsMock = require('./component-mock');
const modelOnFs = require('./model-on-fs');
const locateConsumer = require('../consumer/locate-consumer');
const BitJson = require('../bit-json');

const readIdsFromBitJson = consumerPath =>
  new Promise((resolve, reject) => {
    try {
      const bitJson = BitJson.load(consumerPath);
      const dependencies = bitJson.getDependenciesArray();
      resolve(dependencies);
    } catch (e) { reject(e); }
  });

function getIdsFromBitJsonIfNeeded(componentIds, consumerPath) {
  return new Promise((resolve, reject) => {
    if (!componentIds || R.isEmpty(componentIds)) {
      return readIdsFromBitJson(consumerPath)
      .then((ids) => {
        if (!ids || R.isEmpty(ids)) return [];
        return resolve(ids);
      }).catch(reject);
    }

    return resolve(componentIds);
  });
}

module.exports = (componentIds) => {
  const currentDir = '/Users/ran/Projects/bit-scope-client' || process.cwd(); // TODO - replace with cwd this is mock
  const consumerPath = locateConsumer(currentDir);

  return getIdsFromBitJsonIfNeeded(componentIds, consumerPath)
  .then((ids) => {
    // return importComponents(ids); // mock - replace to the real importer
    return Promise.resolve(componentsMock);
  }).then(componentDependencies => modelOnFs(componentDependencies));
};
