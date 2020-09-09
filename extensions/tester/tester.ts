import { Component, ComponentID, ComponentMap } from '@teambit/component';
import { ConcreteService, ExecutionContext } from '@teambit/environments';
import { Workspace } from '@teambit/workspace';
import { Network } from '@teambit/isolator';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';
import { TestResult } from './test-results';

export type TestResults = {
  components: {
    componentId: ComponentID;
    testSuites: {
      tests: TestResult[];
      file: string;
    };
  }[];
  errors: Error[];
};

export interface TesterContext extends ExecutionContext {
  /**
   * list of components to test.
   */
  components: Component[];

  /**
   * component workspace.
   */
  //workspace: Workspace;

  /**
   * list of components to test with With Relative Specs paths.
   */
  //relativeTestFile: ComponentWithRelativeSpecs;

  /**
   * defines whether tester is expected to run in quite mode.
   */
  quite?: boolean;

  /**
   * list of spec files to test.
   */
  specFiles: ComponentMap<AbstractVinyl[]>;

  /**
   * rootPath of the component workspace.
   */
  rootPath: string;

  /**
   * determines whether tester is expected to run in watch mode.
   */
  watch?: boolean;

  /**
   * determines whether tester is expected to run in debug mode.
   */
  debug?: boolean;
}

/**
 * tester interface allows extensions to implement a component tester into bit.
 */
export interface Tester extends ConcreteService {
  /**
   * execute tests on all components in the given execution context.
   */
  test(context: TesterContext): Promise<TestResults>;
}
