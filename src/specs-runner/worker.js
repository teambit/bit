const serializeError = require('serialize-error');

try {
  const implFilePath = process.env.__impl__;
  const specsFilePath = process.env.__specs__;
  const testerFilePath = process.env.__tester__;

  const tester = require(testerFilePath);
  const mock = require('mock-require');

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
      mock(m, tester.modules[m]);
    }
  }

  tester.run(specsFilePath)
  .then((results) => {
    return process.send({ type: 'results', payload: results });
  })
  .catch((err) => {
    return process.send({ type: 'error', payload: serializeError(err) });
  });
} catch (e) {
  process.send({ type: 'error', payload: serializeError(e) });
}
