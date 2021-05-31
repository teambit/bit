import { Component, ComponentID, ComponentMap } from '@teambit/component';
import { ExecutionContext } from '@teambit/envs';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { TestsResult } from '@teambit/tests-results';

export type Tests = {
  components: ComponentsResults[];
  errors?: Error[];
};

export type ComponentsResults = {
  componentId: ComponentID;
  results?: TestsResult;
  loading?: boolean;
};

export type SpecFiles = ComponentMap<AbstractVinyl[]>;
export type ComponentPatternsMap = ComponentMap<{ path: string; relative: string }[]>;

export interface TesterContext extends ExecutionContext {
  /**
   * list of components to test.
   */
  components: Component[];

  /**
   * component workspace.
   */
  // workspace: Workspace;

  /**
   * defines whether tester is expected to run in quiet mode.
   */
  quiet?: boolean;

  /**
   * list of spec files to test.
   */
  specFiles: SpecFiles;

  /**
   * rootPath of the component workspace.
   */
  rootPath: string;

  /**
   * determines whether tester is expected to run in debug mode.
   */
  debug?: boolean;

  /**
   * is start from ui
   */
  ui?: boolean;

  /**
   * determines whether to start the tester in watch mode.
   */
  watch?: boolean;

  /**
   * array of patterns to test.
   */
  patterns: ComponentPatternsMap;
}

/**
 * tester interface allows extensions to implement a component tester into bit.
 */
export interface Tester {
  /**
   * display name of the tester.
   */
  displayName?: string;

  /**
   * icon of the tester.
   */
  icon?: string;

  /**
   * serialized config of the tester.
   */
  displayConfig?(): string;

  /**
   * path to the config in the filesystem.
   */
  configPath?: string;

  /**
   * id of the tester.
   */
  id: string;

  /**
   * on test run complete. (applies only during watch)
   * @param callback
   */
  onTestRunComplete?(callback: CallbackFn): Promise<void>;

  /**
   * execute tests on all components in the given execution context.
   */
  test(context: TesterContext): Promise<Tests>;

  /**
   * watch tests on all components
   */
  watch?(context: TesterContext): Promise<Tests>;
  /**
   * return the tester version.
   */
  version(): string;
}
export type CallbackFn = (testSuite: Tests) => void;
