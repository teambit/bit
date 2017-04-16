const path = require('path');
const fs = require('fs');
const R = require('ramda');
const { ID_DELIMITER, BIT_JSON_NAME } = require('../constants');
const resolveBit = require('../bit-resolver');
const stackTrace = require('stack-trace');
const BitJson = require('bit-scope-client/bit-json');

module.exports = (consumer, boxName, bitName, opts) => { // eslint-disable-line
  let dependencyMap = null;
  const callerDirectory = path.dirname(stackTrace.get()[2].getFileName());
  const localBitJsonPath = path.join(callerDirectory, BIT_JSON_NAME);

  const consumerBitJson = consumer.getBitJson();
  const consumerDependencyMap = consumerBitJson.getDependencyMap(consumer.getPath());

  if (fs.existsSync(localBitJsonPath)) {
    const localBitJson = BitJson.load(callerDirectory);
    const localDependencyMap = localBitJson.getDependencyMap(consumer.getPath());
    dependencyMap = R.merge(consumerDependencyMap, localDependencyMap);
  } else { dependencyMap = consumerDependencyMap; }

  const chosenDependency = dependencyMap[`${boxName}${ID_DELIMITER}${bitName}`];

  if (chosenDependency) {
    const { scope, box, name, version } = chosenDependency;
    const bitPath = path.join(consumer.getBitsDir(), box, name, scope, version);
    return resolveBit(bitPath, opts);
  }
};
