const Mocha = require('mocha');
const chai = require('chai');
const bit = require('bit-node');

const isEmptyObject = obj => Object.keys(obj).length === 0;

function normalizeResults(mochaJsonResults) {
  function normalizeError(err) {
    return {
      message: err.message,
      stack: err.stack
    };
  }

  function normalizeStats(stats) {
    return {
      start: stats.start,
      end: stats.end
    };
  }

  function normalizeTest(test) {
    const isError = !isEmptyObject(test.err);
    return ({
      title: test.fullTitle,
      pass: !isError,
      err: isError ? normalizeError(test.err) : null
    });
  }

  return {
    tests: mochaJsonResults.tests.map(normalizeTest),
    stats: normalizeStats(mochaJsonResults.stats)
  };
}

const run = (specFile) => {
  return new Promise((resolve) => {
    const mocha = new Mocha({ reporter: 'json' });
    mocha.addFile(specFile);
    mocha.run()
    .on('end', function() { // eslint-disable-line
      return resolve(normalizeResults(this.testResults));
    });
  });
};

module.exports = {
  run,
  globals: {
    chai,
    bit,
  },
  modules: {
    chai,
    'bit-node': bit,
  },
};
