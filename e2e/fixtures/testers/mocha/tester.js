const Mocha = require('mocha');
const chai = require('chai');
const sinon = require('sinon');
const mockery = require('mockery');
const sinonChai = require('sinon-chai');

chai.use(sinonChai);

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
    return {
      title: test.fullTitle,
      pass: !isError,
      err: isError ? normalizeError(test.err) : null,
      duration: test.duration
    };
  }

  function normalizeFailure(failure) {
    const isError = !isEmptyObject(failure.err);
    return {
      title: failure.fullTitle,
      err: isError ? normalizeError(failure.err) : null,
      duration: failure.duration
    };
  }

  return {
    tests: mochaJsonResults.tests.map(normalizeTest),
    stats: normalizeStats(mochaJsonResults.stats),
    failures: mochaJsonResults.failures.map(normalizeFailure)
  };
}

const run = (specFile) => {
  return new Promise((resolve) => {
    const mocha = new Mocha({ reporter: JSONReporter });
    mocha.addFile(specFile);
    mocha.run().on('end', function () {
      // eslint-disable-line
      return resolve(normalizeResults(this.testResults));
    });
  });
};

const getTemplate = (name) => {
  return `const chai = require('chai');
const should = chai.should();
const component = require(__impl__);

describe('${name}', () => {
  it('the component should exist', () => {
    return should.exist(component);
  });
});

`;
};

module.exports = {
  run,
  globals: {
    chai,
    sinon,
    mockery
  },
  modules: {
    chai,
    sinon,
    mockery
  },
  getTemplate
};

/** *
 * Initialize a new `Base` reporter.
 *
 * All other reporters generally
 * inherit from this reporter, providing
 * stats such as test duration, number
 * of tests passed / failed etc.
 *
 * @param {Runner} runner
 * @api public
 */

function Base(runner) {
  const stats = (this.stats = { suites: 0, tests: 0, passes: 0, pending: 0, failures: 0 });
  const failures = (this.failures = []);

  if (!runner) {
    return;
  }
  this.runner = runner;

  runner.stats = stats;

  runner.on('start', function () {
    stats.start = new Date();
  });

  runner.on('suite', function (suite) {
    stats.suites = stats.suites || 0;
    suite.root || stats.suites++;
  });

  runner.on('test end', function () {
    stats.tests = stats.tests || 0;
    stats.tests++;
  });

  runner.on('pass', function (test) {
    stats.passes = stats.passes || 0;

    if (test.duration > test.slow()) {
      test.speed = 'slow';
    } else if (test.duration > test.slow() / 2) {
      test.speed = 'medium';
    } else {
      test.speed = 'fast';
    }

    stats.passes++;
  });

  runner.on('fail', function (test, err) {
    stats.failures = stats.failures || 0;
    stats.failures++;
    test.err = err;
    failures.push(test);
  });

  runner.on('end', function () {
    stats.end = new Date();
    stats.duration = new Date() - stats.start;
  });

  runner.on('pending', function () {
    stats.pending++;
  });
}

/** *
 * Initialize a new `JSON` reporter.
 *
 * @api public
 * @param {Runner} runner
 */
function JSONReporter(runner) {
  Base.call(this, runner);

  const self = this;
  const tests = [];
  const pending = [];
  const failures = [];
  const passes = [];

  runner.on('test end', function (test) {
    tests.push(test);
  });

  runner.on('pass', function (test) {
    passes.push(test);
  });

  runner.on('fail', function (test) {
    failures.push(test);
  });

  runner.on('pending', function (test) {
    pending.push(test);
  });

  runner.on('end', function () {
    const obj = {
      stats: self.stats,
      tests: tests.map(clean),
      pending: pending.map(clean),
      failures: failures.map(clean),
      passes: passes.map(clean)
    };

    runner.testResults = obj;
  });
}

/**
 * Return a plain-object representation of `test`
 * free of cyclic properties etc.
 *
 * @api private
 * @param {Object} test
 * @return {Object}
 */
function clean(test) {
  return {
    title: test.title,
    fullTitle: test.fullTitle(),
    duration: test.duration,
    currentRetry: test.currentRetry(),
    err: errorJSON(test.err || {})
  };
}

/**
 * Transform `error` into a JSON object.
 *
 * @api private
 * @param {Error} err
 * @return {Object}
 */
function errorJSON(err) {
  const res = {};
  Object.getOwnPropertyNames(err).forEach(function (key) {
    res[key] = err[key];
  }, err);
  return res;
}
