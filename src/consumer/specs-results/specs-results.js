/** @flow */
type ErrorObj = {
  message: string,
  stack: string,
}

type Test = {
  title: string,
  pass: bool,
  err: ?ErrorObj,
  duration: number
}

type Stats = {
  start: string,
  end: string,
  duration: number
}

export type Results = {
  tests: Test[],
  stats: Stats,
  passed: bool
}

type TestProps = {
  title: string,
  pass: bool,
  err: ?ErrorObj,
  duration: number|string
}

type StatsProps = {
  start: string,
  end: string,
  duration: ?number|string
}

export type ResultsProps = {
  tests: TestProps[],
  stats: StatsProps,
  passed: ?bool
}

export default class SpecsResults {
  tests: Test[];
  stats: Stats;
  passed: bool;

  constructor({ tests, stats, passed }: Results) {
    this.tests = tests;
    this.stats = stats;
    this.passed = passed;
  }

  serialize() {
    return {
      tests: this.tests,
      stats: this.stats,
      passed: this.passed,
    };
  }

  static deserialize(plainObject: Results) {
    return new SpecsResults(plainObject);
  }

  static createFromRaw(rawResults: ResultsProps): SpecsResults {
    const passed = rawResults.passed || rawResults.tests.every(test => test.pass);

    const calcDuration = (endDateString, startDateString) => 
      new Date(endDateString) - new Date(startDateString);

    const stats = {
      start: rawResults.stats.start,
      end: rawResults.stats.end,
      duration: parseInt(rawResults.stats.duration) || 
        calcDuration(rawResults.stats.end, rawResults.stats.start)
    };

    const tests = rawResults.tests.map((result) => {
      result.duration = parseInt(result.duration);
      // $FlowFixMe
      return result;
    });

    return new SpecsResults({ tests, stats, passed });
  }
}
