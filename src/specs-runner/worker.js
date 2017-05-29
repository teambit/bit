// TODO - move to language specific driver.

const serializeError = require('serialize-error');

try {
  const implFilePath = process.env.__impl__;
  const specsFilePath = process.env.__specs__;
  const testerFilePath = process.env.__tester__;

  const mockery = require('mockery');
  mockery.enable({
    warnOnReplace: false,
    warnOnUnregistered: false,
    useCleanCache: true,
  }); // enable mocks on process

  const tester = require(testerFilePath);

  // define the __impl__ global
  global.__impl__ = implFilePath;

  // register globals
  if (tester.globals) {
    for (const g in tester.globals) { // eslint-disable-line
      global[g] = tester.globals[g];
    }
  }

  // register modules
  if (tester.modules) {
    for (const m in tester.modules) { // eslint-disable-line
      mockery.registerMock(m, tester.modules[m]);
    }
  }

  if (!tester.run) {
    process.send({
      type: 'error',
      payload: `"${process.env.__testerId__}" doesn't have a valid tester interface`
    });
    process.exit(1);
  }

  tester.run(specsFilePath)
  .then((results) => {
    mockery.disable();
    return process.send({ type: 'results', payload: results });
  })
  .catch((err) => {
    mockery.disable();
    return process.send({ type: 'error', payload: serializeError(err) });
  });
} catch (e) {
  process.send({ type: 'error', payload: serializeError(e) });
}
