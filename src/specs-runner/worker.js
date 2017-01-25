const serializeError = require('serialize-error');

const implFilePath = process.env.___impl___;
const specsFilePath = process.env.___specs___;
const testerFilePath = process.env.___tester___;

const tester = require(testerFilePath);
const mock = require('mock-require');

// define the ___impl___ global
global.___impl___ = implFilePath;

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
