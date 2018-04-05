// TODO - move to language specific driver.
const GeneralError = require('../error/general-error');

const serializeError = require('serialize-error');

try {
  const mainFilePath = process.env.__mainFile__;
  const testFilePath = process.env.__testFilePath__;
  const testerFilePath = process.env.__tester__;

  const mockery = require('mockery');
  mockery.enable({
    warnOnReplace: false,
    warnOnUnregistered: false,
    useCleanCache: true
  }); // enable mocks on process

  const tester = require(testerFilePath);

  // define the __impl__ global
  global.__impl__ = mainFilePath;

  // register globals
  if (tester.globals) {
    Object.keys(tester.globals).forEach((g) => {
      global[g] = tester.globals[g];
    });
  }

  // register modules
  if (tester.modules) {
    Object.keys(tester.modules).forEach((m) => {
      mockery.registerMock(m, tester.modules[m]);
    });
  }

  if (!tester.run) {
    process.send({
      type: 'error',
      payload: `"${process.env.__testerId__}" doesn't have a valid tester interface`
    });
    process.exit(1);
  }

  tester
    .run(testFilePath)
    .then((results) => {
      if (!results) throw new GeneralError(`tester did not return any result for the file ${testFilePath}`);
      mockery.disable();
      results.specPath = testFilePath;
      return process.send({ type: 'results', payload: results });
    })
    .catch((err) => {
      mockery.disable();
      return process.send({ type: 'error', payload: serializeError(err) });
    });
} catch (e) {
  process.send({ type: 'error', payload: serializeError(e) });
}
