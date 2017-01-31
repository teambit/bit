/** @flow */
export type ErrorObj = {
  message: string,
  stack: string,
}

export type Test = {
  title: string,
  pass: bool,
  err: ?ErrorObj
}

export type Stats = {
  start: string,
  end: string
}

export type Results = {
  tests: Test[],
  stats: Stats,
}

export default class SpecsResults {
  tests: Test[];
  stats: Stats;
  
  constructor({ tests, stats }: Results) {
    this.tests = tests;
    this.stats = stats;
  }

  serialize() {
    return {
      tests: this.tests,
      stats: this.stats
    };
  }

  static deserialize(plainObject: Results) {
    return new SpecsResults(plainObject);
  }
}
