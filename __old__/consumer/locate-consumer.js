const { pathHasConsumer } = require('./consumer-utils');
const { NoConsumerFoundException } = require('../exceptions');
const locateRecursively = require('./locate-recursively');

module.exports = locateRecursively(pathHasConsumer, NoConsumerFoundException);
