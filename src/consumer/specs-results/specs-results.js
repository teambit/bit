/** @flow */
type ErrorObj = {
  message: string,
  stack: string
};

type Test = {
  title: string,
  pass: boolean,
  err: ?ErrorObj,
  duration: number
};
type Failure = {
  title: string,
  err: ?ErrorObj,
  duration: number
};

type Stats = {
  start: string,
  end: string,
  duration: number
};

export type Results = {
  tests: Test[],
  stats: Stats,
  pass: boolean
};

type TestProps = {
  title: string,
  pass: boolean,
  err: ?ErrorObj,
  duration: number | string
};

type StatsProps = {
  start: string,
  end: string,
  duration: ?number | string
};

export type ResultsProps = {
  tests: TestProps[],
  stats: StatsProps,
  pass: ?boolean
};

export default class SpecsResults {
  tests: Test[];
  stats: Stats;
  pass: boolean;
  failures: Failure[];
  specFile: string;

  constructor({ tests, stats, pass, failures, specFile }: Results) {
    this.tests = tests;
    this.stats = stats;
    this.pass = pass;
    this.failures = failures;
    this.specFile = specFile;
  }

  serialize() {
    return {
      tests: this.tests,
      stats: this.stats,
      pass: this.pass,
      failures: this.failures,
      specFile: this.specFile
    };
  }

  static deserialize(plainObject: Results) {
    return new SpecsResults(plainObject);
  }

  static createFromRaw(rawResults: ResultsProps): SpecsResults {
    const hasFailures = rawResults.failures && rawResults.failures.length;
    const pass = rawResults.pass || (rawResults.tests.every(test => test.pass) && !hasFailures);
    let failures;

    const calcDuration = (endDateString, startDateString) => new Date(endDateString) - new Date(startDateString);

    const stats = {
      start: rawResults.stats.start,
      end: rawResults.stats.end,
      duration: parseInt(rawResults.stats.duration) || calcDuration(rawResults.stats.end, rawResults.stats.start)
    };

    const tests = rawResults.tests.map((result) => {
      result.duration = parseInt(result.duration);
      // $FlowFixMe
      return result;
    });

    if (hasFailures) {
      failures = rawResults.failures.map((failure) => {
        failure.duration = parseInt(failure.duration);
        // $FlowFixMe
        return failure;
      });
    }

    return new SpecsResults({ tests, stats, pass, failures, specFile: rawResults.specPath });
  }
}
