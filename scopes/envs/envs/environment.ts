import type { Linter } from '@teambit/linter';
import type { Formatter } from '@teambit/formatter';
import type { Tester } from '@teambit/tester';
import type { Bundler, BundlerContext, DevServer, DevServerContext } from '@teambit/bundler';
import type { BuildTask } from '@teambit/builder';
import type { SchemaExtractor } from '@teambit/schema';
import type { WebpackConfigTransformer } from '@teambit/webpack';
import type { PackageJsonProps } from '@teambit/pkg';
import type { VariantPolicyConfigObject } from '@teambit/dependency-resolver';
import type { TsConfigSourceFile } from 'typescript';

export type EnvDescriptor = {
  type: string;
};

/**
 * add a custom type and include all properties from within the environment.
 */
export interface Environment {
  /**
   * name of the environment.
   */
  name?: string;

  /**
   * description of the environment.
   */
  description?: string;

  /**
   * icon of the environment.
   */
  icon?: string;

  [key: string]: any; // :TODO need to define an abstract type for service handlers (now using any)

  /**
   * Returns the Environment descriptor
   * Required for any task
   */
  __getDescriptor?: () => Promise<EnvDescriptor>;

  /**
   * Returns a schema generator instance
   */
  getSchemaExtractor?: (config?: any) => SchemaExtractor;
}

export interface DependenciesEnv extends Environment {
  /**
   * Returns the list of dependencies
   * Required for any task
   */
  getDependencies?: () => VariantPolicyConfigObject | Promise<VariantPolicyConfigObject>;
}

export interface PackageEnv extends Environment {
  /**
   * define the package json properties to add to each component.
   * Used by `bit link` to augment package.json with new properties
   */
  getPackageJsonProps?: () => PackageJsonProps;
}

export interface LinterEnv extends Environment {
  /**
   * Returns & configures the linter to use (ESLint, ...)
   * Required for `bit lint`
   */
  getLinter?: () => Linter;
}

export interface FormatterEnv extends Environment {
  /**
   * Returns & configures the formatter to use (prettier, ...)
   * Required for `bit format`
   */
  getFormatter?: () => Formatter;
}

export interface PreviewEnv extends Environment {
  /**
   * Returns a paths to a function which mounts a given component to DOM
   * Required for `bit start` & `bit build`
   */
  getMounter?: () => string;

  /**
   * Returns a path to a docs template.
   * Required for `bit start` & `bit build`
   */
  getDocsTemplate?: () => string;

  /**
   * Returns a bundler for the preview.
   * Required for `bit build` & `bit start`
   */
  getBundler?: (context: BundlerContext, transformers: any[]) => Promise<Bundler>;
}

export interface BuilderEnv extends PreviewEnv {
  /**
   * @deprecated Fatal: a breaking API was introduced. Use getBuildPipe() instead.
   */
  getPipe?: () => BuildTask[];

  /**
   * Returns the component build pipeline
   * Either `getBuildPipe`, `getTagPipe`, or `getSnapPipe` is required for `bit build`
   */
  getBuildPipe?: (tsconfig?: TsConfigSourceFile) => BuildTask[];

  /**
   * Returns the component tag pipeline
   * Either `getBuildPipe`, `getTagPipe`, or `getSnapPipe` is required for `bit build`
   */
  getTagPipe?: (tsconfig?: TsConfigSourceFile) => BuildTask[];

  /**
   * Returns the component snap pipeline
   * Either `getBuildPipe`, `getTagPipe`, or `getSnapPipe` is required for `bit build`
   */
  getSnapPipe?: (tsconfig?: TsConfigSourceFile) => BuildTask[];
}

export interface TesterEnv extends Environment {
  /**
   * Returns a tester
   * Required for `bit start` & `bit test`
   */
  getTester?: (path: string, tester: any) => Tester;
}

export interface DevEnv extends PreviewEnv {
  /**
   * Required for `bit start`
   */
  getDevEnvId?: (context?: any) => string;

  /**
   * Returns and configures the dev server
   * Required for `bit start`
   */
  getDevServer?: (
    context: DevServerContext,
    transformers: WebpackConfigTransformer[]
  ) => DevServer | Promise<DevServer>;
}
