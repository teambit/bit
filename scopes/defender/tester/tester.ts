import { Component, ComponentID, ComponentMap } from '@teambit/component';
import { ExecutionContext } from '@teambit/envs';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { TestsResult } from '@teambit/tests-results';

export class Tests {
  constructor(public components: ComponentsResults[]) {}
  get errors(): Error[] {
    return this.components.map((comp) => comp.errors || []).flat();
  }
}

export type ComponentsResults = {
  /**
   * component id.
   */
  componentId: ComponentID;
  /**
   * test results for the component.
   */
  results?: TestsResult;
  /**
   * aggregated errors from all files
   */
  errors?: Error[];

  /**
   * loading.
   */
  loading?: boolean;
};

export type SpecFiles = ComponentMap<AbstractVinyl[]>;
export type ComponentPatternsEntry = { componentDir: string, paths: {path: string; relative: string}[]};
export type ComponentPatternsMap = ComponentMap<ComponentPatternsEntry>;

export interface TesterContext extends ExecutionContext {
  /**
   * whether the tester run for release (during bit build/tag) or not (during bit test command).
   */
  release: boolean;

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
   * rootPath of the component workspace or the capsule root dir (during build).
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
   * whether the tester should show code coverage
   */
  coverage?: boolean;

  /**
   * array of patterns to test.
   */
  patterns: ComponentPatternsMap;

  /**
   *
   * additional test host dependencies
   * This can be used in cases when you want specific dependencies to be resolved from the env during testing
   * but you don't want these dependencies as peer dependencies of the component (as they are not used during runtime)
   * An example for this is @angular/compiler, which during running tests you want to resolve from the env, but you don't
   * need it during component runtime.
   */
  additionalHostDependencies?: string[];
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
