import junitReportBuilder from 'junit-report-builder';
import stripAnsi from 'strip-ansi';
import { ComponentsResults } from '../tester';

export function testsResultsToJUnitFormat(components: ComponentsResults[]): string {
  const builder = junitReportBuilder.newBuilder();
  components.forEach((compResult) => {
    const suite = builder.testSuite().name(compResult.componentId.toString());
    if (compResult.results?.start) {
      suite.timestamp(new Date(compResult.results?.start).toISOString());
    }
    compResult.results?.testFiles.forEach((testFile) => {
      if (testFile.error) {
        const testCase = suite.testCase().className(testFile.file).name(testFile.file);
        testCase.error(stripAnsi(testFile.error.message as string));
      }
      testFile.tests.forEach((test) => {
        const testCase = suite.testCase().className(testFile.file).name(test.name);
        if (test.error) {
          testCase.error(stripAnsi(test.error));
        }
        if (test.failure) {
          testCase.failure(stripAnsi(test.failure));
        }
        if (test.status === 'skipped' || test.status === 'pending') {
          testCase.skipped();
        }
        if (test.duration) {
          testCase.time(test.duration / 1000);
        }
      });
    });
  });
  return builder.build();
}
