const path = require('path');
const Consumer = require('../consumer/consumer');
const locateConsumer = require('../consumer/locate-consumer');
const parseBitFullId = require('../bit-id/parse-bit-full-id');
const resolveBit = require('./bit-resolver');

module.exports = (fullId, opts) => {
  const consumerPath = locateConsumer(process.cwd());
  const consumer = new Consumer(consumerPath);
  const { scope, box, name, version } =
  parseBitFullId({ id: fullId, consumerPath: consumer.getPath() });
  const bitPath = path.join(consumer.getBitsDir(), box, name, scope, version);
  return resolveBit(bitPath, opts);
};
