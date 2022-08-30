import pMapSeries from 'p-map-series';
import { Tester, TesterContext, Tests, ComponentsResults } from '@teambit/tester';
import { TestsResult } from '@teambit/tests-results';
import { compact } from 'lodash';

export type MultiCompilerOptions = {
  targetExtension?: string;
};

export class MultiTester implements Tester {
  displayName = 'Multi tester';

  constructor(readonly id: string, readonly testers: Tester[]) {}

  displayConfig() {
    return this.testers
      .map((tester) => {
        return `${tester.displayName}\n${tester.displayConfig}\n`;
      })
      .join('\n');
  }

  async test(context: TesterContext): Promise<Tests> {
    const allResults = await pMapSeries(this.testers, (tester) => {
      return tester.test(context);
    });
    const merged = this.mergeTests(allResults);
    return merged;
  }

  // TODO: not working properly yet
  async watch(context: TesterContext): Promise<Tests> {
    const allResults = await pMapSeries(this.testers, (tester) => {
      return tester.watch ? tester.watch(context) : tester.test(context);
    });
    const merged = this.mergeTests(allResults);
    return merged;
  }

  /**
   * returns the version of all testers instance (e.g. '4.0.1').
   */
  version(): string {
    return this.testers
      .map((tester) => {
        return `${tester.displayName}@${tester.version()}`;
      })
      .join('\n');
  }

  private mergeTests(tests: Tests[]): Tests {
    const componentResultsMap = new Map<string, ComponentsResults>();

    compact(tests).forEach((currentTests) => {
      currentTests.components.forEach((currentComponentResults) => {
        const currIdStr = currentComponentResults.componentId.toString();
        const foundComponent = componentResultsMap.get(currIdStr);
        if (foundComponent) {
          componentResultsMap.set(currIdStr, this.mergeComponentResults(foundComponent, currentComponentResults));
        } else {
          componentResultsMap.set(currIdStr, currentComponentResults);
        }
      });
    });

    return new Tests(Array.from(componentResultsMap.values()));
  }

  private mergeComponentResults(results1: ComponentsResults, results2: ComponentsResults): ComponentsResults {
    const merged: ComponentsResults = {
      componentId: results1.componentId,
    };
    let start;
    if (!results1.results?.start) {
      start = results2.results?.start;
    } else if (!results2.results?.start) {
      start = results1.results?.start;
    } else {
      // Take sooner start
      start = results1.results?.start < results2.results?.start ? results1.results?.start : results2.results?.start;
    }
    const mergedTestsResults: TestsResult = new TestsResult(
      [...(results1.results?.testFiles || []), ...(results2.results?.testFiles || [])],
      results1.results?.success && results2.results?.success,
      start
    );
    merged.results = mergedTestsResults;
    merged.errors = [...(results1.errors || []), ...(results2.errors || [])];
    merged.loading = results1.loading || results2.loading;
    return merged;
  }
}
