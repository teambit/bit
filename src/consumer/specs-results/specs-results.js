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
  pass: bool
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
  pass: ?bool
}

export default class SpecsResults {
  tests: Test[];
  stats: Stats;
  pass: bool;
  specFile: string;

  constructor({ tests, stats, pass, specFile }: Results) {
    this.tests = tests;
    this.stats = stats;
    this.pass = pass;
    this.specFile = specFile;
  }

  serialize() {
    return {
      tests: this.tests,
      stats: this.stats,
      pass: this.pass,
      specFile: this.specFile
    };
  }

  static deserialize(plainObject: Results) {
    return new SpecsResults(plainObject);
  }

  static createFromRaw(rawResults: ResultsProps): SpecsResults {
    const pass = rawResults.pass || rawResults.tests.every(test => test.pass);

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

    return new SpecsResults({ tests, stats, pass, specFile: rawResults.specPath });
  }
}
