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
  console.log(results);
  return process.send(results);
})
.catch((err) => {
  console.error('\n ohhh an error:', err); // TODO - remove when verified
  throw err;
});
