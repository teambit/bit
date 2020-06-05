import { join } from 'path';
import { EnvService, ExecutionContext } from '../environments';
import { Tester, TestResults } from './tester';
import { detectTestFiles } from './utils';

export class TesterService implements EnvService {
  constructor(
    /**
     * regex used to identify which files to test.
     */
    readonly testsRegex: string
  ) {}

  async run(context: ExecutionContext): Promise<TestResults> {
    const tester: Tester = context.env.getTester();
    const components = detectTestFiles(context.components);

    const testMatch = components.reduce((acc: string[], component: any) => {
      const specs = component.specs.map(specFile =>
        join(context.workspace.path, component.state._consumer.componentMap?.getComponentDir(), specFile)
      );

      acc = acc.concat(specs);
      return acc;
    }, []);

    const testerContext = Object.assign(context, {
      release: false,
      specFiles: testMatch,
      rootPath: context.workspace.path
    });

    return tester.test(testerContext);
  }
}
