const Mocha = require('mocha');
let logger;

const tester = {
  init: ({ rawConfig, dynamicConfig, api }) => {
    logger = api.getLogger();
    return { write: true };
  },
  getDynamicConfig: ({ rawConfig }) => {
    const dynamicConfig = Object.assign({}, rawConfig);
    if (dynamicConfig.valToDynamic){
      dynamicConfig.valToDynamic = 'dyanamicValue';
    }
    return dynamicConfig;
  },
  getDynamicPackageDependencies: ({ rawConfig, dynamicConfig, configFiles, context }) => {
    const dynamicPackageDependencies = {
      "lodash.get": '4.4.2'
    };

    return { devDependencies: dynamicPackageDependencies };
  },
  action: ({
    testFiles,
    rawConfig,
    dynamicConfig,
    configFiles,
    api,
    context
  }) => {
    let config = {};
    const configFile = getFileByName('config', configFiles);
    if (configFile) {
      const rawConfigFile = configFile.contents.toString();
      config = JSON.parse(rawConfigFile);
    }
    // This is not a good idea to get it from external file
    // it's here only to tests that the files passed correctly
    const reporter = config.reporter || JSONReporter;

    try {
      return new Promise((resolve) => {
        const mocha = new Mocha({ reporter: JSONReporter });
        testFiles.forEach((testFile) => {
          mocha.addFile(testFile.path);
        });
        mocha.run()
        .on('end', function() { // eslint-disable-line
          const result = normalizeResults(this.testResults);
          return resolve([result]);
        });
      });
    } catch (e) {
      throw e;
    }
  }
}

module.exports = tester;

function getFileByName(name, files) {
  return files.find((file) => (file.name === name));
 }

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
      err: isError ? normalizeError(test.err) : null,
      duration: test.duration
    });
  }

  function normalizeFailure(failure) {
    const isError = !isEmptyObject(failure.err);
    return ({
      title: failure.fullTitle,
      err: isError ? normalizeError(failure.err) : null,
      duration: failure.duration
    });
  }

  return {
    tests: mochaJsonResults.tests.map(normalizeTest),
    stats: normalizeStats(mochaJsonResults.stats),
    failures: mochaJsonResults.failures.map(normalizeFailure)
  };
}



/***
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

function Base (runner) {
  var stats = this.stats = { suites: 0, tests: 0, passes: 0, pending: 0, failures: 0 };
  var failures = this.failures = [];

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

/***
 * Initialize a new `JSON` reporter.
 *
 * @api public
 * @param {Runner} runner
 */
function JSONReporter (runner) {
  Base.call(this, runner);

  var self = this;
  var tests = [];
  var pending = [];
  var failures = [];
  var passes = [];

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
    var obj = {
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
function clean (test) {
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
function errorJSON (err) {
  var res = {};
  Object.getOwnPropertyNames(err).forEach(function (key) {
    res[key] = err[key];
  }, err);
  return res;
}