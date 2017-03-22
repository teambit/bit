const R = require('ramda');
const importComponents = require('bit-scope-client');

const readIdsFromBitJson = () => Promise.resolve([]); // TODO - implement

function getIdsFromBitJsonIfNeeded(componentIds) {
  return new Promise((resolve, reject) => {
    if (!componentIds || R.isEmpty(componentIds)) {
      return readIdsFromBitJson()
      .then((ids) => {
        if (!ids || R.isEmpty(ids)) return [];
        return resolve(ids);
      }).catch(reject);
    }

    return resolve(componentIds);
  });
}

module.exports = (componentIds) => {
  return getIdsFromBitJsonIfNeeded(componentIds)
  .then((ids) => {
    return importComponents(ids);
  });
};
