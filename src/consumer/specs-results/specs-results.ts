import { BitId } from '../../bit-id';
import { pathNormalizeToLinux } from '../../utils';
import { PathLinux, PathOsBased } from '../../utils/path';

type ErrorObj = {
  message: string;
  stack: string;
};

type Test = {
  title: string;
  pass: boolean;
  err: ErrorObj | null | undefined;
  duration: number;
};
type Failure = {
  title: string;
  err: ErrorObj | null | undefined;
  duration: number;
};

type Stats = {
  start: string;
  end: string;
  duration: number;
};

export type Results = {
  tests: Test[];
  stats: Stats;
  pass: boolean;
  failures: Failure[];
  specFile: PathLinux;
};

type TestProps = {
  title: string;
  pass: boolean;
  err: ErrorObj | null | undefined;
  duration: number | string;
};

type StatsProps = {
  start: string;
  end: string;
  duration: number | null | undefined | string;
};

export type RawTestsResults = {
  tests: TestProps[];
  stats: StatsProps;
  pass: boolean | null | undefined;
  failures: Failure[] | null | undefined;
  specPath: PathOsBased;
};

export type SpecsResultsWithComponentId = Array<{
  componentId: BitId;
  specs: SpecsResults;
  missingTester?: boolean;
  missingDistSpecs?: boolean;
  pass: boolean;
}>;

export type SpecsResultsWithMetaData = {
  type: 'results' | 'error';
  childOutput?: string;
  error?: Error;
  results?: SpecsResultsWithComponentId;
};

export default class SpecsResults {
  tests: Test[];
  stats: Stats;
  pass: boolean;
  failures: Failure[];
  specFile: PathLinux;

  constructor({ tests, stats, pass, failures, specFile }: Results) {
    this.tests = tests;
    this.stats = stats;
    this.pass = pass;
    this.failures = failures;
    this.specFile = pathNormalizeToLinux(specFile);
  }

  serialize() {
    return {
      tests: this.tests,
      stats: this.stats,
      pass: this.pass,
      failures: this.failures,
      specFile: this.specFile,
    };
  }

  static deserialize(plainObject: Results) {
    return new SpecsResults(plainObject);
  }

  static createFromRaw(rawResults: RawTestsResults): SpecsResults {
    const hasFailures = rawResults.failures && rawResults.failures.length;
    const pass = rawResults.pass || (!hasFailures && rawResults.tests.every((test) => test.pass));
    let failures;

    const calcDuration = (endDateString, startDateString) => {
      if (!endDateString || !startDateString) return undefined;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return new Date(endDateString) - new Date(startDateString);
    };

    const start = rawResults.stats ? rawResults.stats.start : undefined;
    const end = rawResults.stats ? rawResults.stats.end : undefined;
    const duration =
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      rawResults.stats && rawResults.stats.duration ? parseInt(rawResults.stats.duration) : calcDuration(end, start);
    const stats = {
      start,
      end,
      duration,
    };

    const tests = rawResults.tests.map((result) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      result.duration = parseInt(result.duration);
      return result;
    });

    if (hasFailures) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      failures = rawResults.failures.map((failure) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        failure.duration = failure.duration ? parseInt(failure.duration) : undefined;
        return failure;
      });
    }

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new SpecsResults({ tests, stats, pass, failures, specFile: rawResults.specPath });
  }
}
