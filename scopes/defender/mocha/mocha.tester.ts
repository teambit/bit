import { Logger } from '@teambit/logger';
import { ComponentsResults, Tester, TesterContext, Tests } from '@teambit/tester';
import Mocha from 'mocha';
import babelRegister from '@babel/register';
import { TestResult, TestsFiles, TestsResult } from '@teambit/tests-results';
import pMapSeries from 'p-map-series';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';

export class MochaTester implements Tester {
  displayName = 'Mocha';
  constructor(
    readonly id: string,
    private logger: Logger,
    readonly mochaConfig: any,
    private babelConfig: any,
    private MochaModule: typeof Mocha
  ) {}
  async test(context: TesterContext): Promise<Tests> {
    // todo: remove this "extensions" property and use "only" with a function that returns true
    // for the specs files paths only. see syntax here: https://babeljs.io/docs/en/babel-register
    babelRegister({ extensions: ['.js', '.jsx', '.ts', '.tsx'], ...(this.babelConfig || {}) });
    const specsPerComp = context.specFiles.toArray();
    const errors: Error[] = [];
    const componentsResults: ComponentsResults[] = await pMapSeries(specsPerComp, async ([component, files]) => {
      const testsFiles: TestsFiles[] = await pMapSeries(files, async (file) => {
        try {
          return await this.runMochaOnOneFile(file);
        } catch (err: any) {
          errors.push(err);
          return new TestsFiles(file.relative, [], 0, 0, 0, undefined, undefined, { error: err.toString() });
        }
      });
      return {
        componentId: component.id,
        results: new TestsResult(testsFiles),
      };
    });
    return {
      components: componentsResults,
      errors: errors.length ? errors : undefined,
    };
  }

  private async runMochaOnOneFile(file: AbstractVinyl): Promise<TestsFiles> {
    const mocha = new this.MochaModule(this.mochaConfig);
    mocha.addFile(file.path);
    const testResults: TestResult[] = [];
    return new Promise((resolve) => {
      const runner = mocha
        .run()
        .on('test end', function (test) {
          // console.log("🚀 ~ file: mocha.tester.ts ~ line 66 ~ MochaTester ~ .on ~ test", test)
          testResults.push(
            new TestResult(test.titlePath(), test.title, test.state, test.duration, undefined, test.err?.message)
          );
          // console.log('Test done: '+ test.title);
        })
        .on('pass', function (test) {
          // testResults.push(new TestResult(test.titlePath(), test.title, 'passed', test.duration));
          // console.log('Test passed');
          // console.log(test);
        })
        .on('fail', function (test, err) {
          // console.log('Test fail');
          // console.log(test);
          // console.log(err);
        })
        .on('end', function () {
          const stats = runner.stats;
          if (!stats) throw new Error('stats is missing');
          const testsFile = new TestsFiles(
            file.relative,
            testResults,
            stats.passes,
            stats.failures,
            stats.pending,
            stats.duration
          );
          resolve(testsFile);
        });
    });
  }

  version(): string {
    // @ts-ignore
    return Mocha.prototype.version || 'N/A';
  }
}
