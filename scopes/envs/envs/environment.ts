// TODO: @gilad refactor to an abstract env.
import type { Linter, LinterContext } from '@teambit/linter';
import type { Formatter, FormatterContext } from '@teambit/formatter';
import type { Tester } from '@teambit/tester';
import type { Compiler } from '@teambit/compiler';
import type { Bundler, BundlerContext, DevServer, DevServerContext } from '@teambit/bundler';
import type { BuildTask } from '@teambit/builder';
import type { SchemaExtractor } from '@teambit/schema';
import type { WebpackConfigTransformer } from '@teambit/webpack';
import type { PackageJsonProps } from '@teambit/pkg';
import type { EnvPolicyConfigObject } from '@teambit/dependency-resolver';
import { ElementsWrapperContext } from '@teambit/elements';
import type { Capsule } from '@teambit/isolator';
import type { Component } from '@teambit/component';
import { EnvPreviewConfig } from '@teambit/preview';

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

  /**
   * Returns the dev patterns to match doc files
   */
  getDocsDevPatterns?: (component: Component) => string[];

  /**
   * Returns the dev patterns to match composition files
   */
  getCompositionsDevPatterns?: (component: Component) => string[];

  /**
   * Returns additional dev patterns for the component.
   * Patterns that were provided by getDocsDevPatterns, getTestsDevPatterns will be considered as dev files as well, without need to add them here.
   */
  getDevPatterns?: (component: Component) => string[];
}

export interface DependenciesEnv extends Environment {
  /**
   * Returns the list of dependencies
   * Required for any task
   */
  getDependencies?: () => EnvPolicyConfigObject | Promise<EnvPolicyConfigObject>;

  /**
   * Returns a list of additional test host dependencies
   * this will be added to the tester context
   * This can be used in cases when you want specific dependencies to be resolved from the env during testing
   * but you don't want these dependencies as peer dependencies of the component (as they are not used during runtime)
   * An example for this is @angular/compiler, which during running tests you want to resolve from the env, but you don't
   * need it during component runtime.
   */
  getAdditionalTestHostDependencies?: () => string[] | Promise<string[]>;

  /**
   * Returns a list of additional host dependencies
   * this list will be provided as globals on the window after bit preview bundle
   * by default bit will merge this list with the peers from the getDependencies function
   */
  getAdditionalHostDependencies?: () => string[] | Promise<string[]>;
}

export type GetNpmIgnoreContext = {
  capsule: Capsule;
  component: Component;
};
export interface PackageEnv extends Environment {
  /**
   * define the package json properties to add to each component.
   * Used by `bit link` to augment package.json with new properties
   */
  getPackageJsonProps?: () => PackageJsonProps;

  /**
   * return `.npmignore` entries to be written before packing the component
   */
  getNpmIgnore?: (npmIgnoreContext?: GetNpmIgnoreContext) => string[];
}

export interface LinterEnv extends Environment {
  /**
   * Returns & configures the linter to use (ESLint, ...)
   * Required for `bit lint`
   */
  getLinter?: (context: LinterContext, transformers: any[]) => Linter;
}

export interface FormatterEnv extends Environment {
  /**
   * Returns & configures the formatter to use (prettier, ...)
   * Required for `bit format`
   */
  getFormatter?: (context: FormatterContext, transformers: any[]) => Formatter;
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

  /**
   * Returns preview config like the strategy name to use when bundling the components for the preview
   */
  getPreviewConfig?: () => EnvPreviewConfig;

  /**
   * Returns a bundler for the env template.
   * this bundler will be used to bundle the docs/compositions (or other preview) apps
   * Required for `bit build` & `bit tag`
   */
  getTemplateBundler?: (context: BundlerContext, transformers?: any[]) => Promise<Bundler>;
}

export interface ElementsEnv extends Environment {
  /**
   * Returns a function that gets the context and wrap the component with a web component
   * Required for `bit build`
   */
  getElementsWrapper: (context: ElementsWrapperContext) => string;

  /**
   * Returns a bundler for elements.
   * Required for `bit build``
   */
  getElementsBundler: (context: BundlerContext, transformers: any[]) => Promise<Bundler>;
}

export type PipeServiceModifiersMap = Record<string, PipeServiceModifier>;

export interface PipeServiceModifier {
  transformers?: Function[];
  module?: any;
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
  getBuildPipe?: (modifiersMap?: PipeServiceModifiersMap) => BuildTask[];

  /**
   * Returns the component tag pipeline
   * Either `getBuildPipe`, `getTagPipe`, or `getSnapPipe` is required for `bit build`
   */
  getTagPipe?: (modifiersMap?: PipeServiceModifiersMap) => BuildTask[];

  /**
   * Returns the component snap pipeline
   * Either `getBuildPipe`, `getTagPipe`, or `getSnapPipe` is required for `bit build`
   */
  getSnapPipe?: (modifiersMap?: PipeServiceModifiersMap) => BuildTask[];
}

export interface TesterEnv extends Environment {
  /**
   * Returns a tester
   * Required for `bit start` & `bit test`
   */
  getTester?: (path: string, tester: any) => Tester;
}

export interface CompilerEnv {
  /**
   * Returns a compiler
   * Required for making and reading dists, especially for `bit compile`
   */
  getCompiler: () => Compiler;

  /**
   * Returns the dev patterns to match test files
   */
  getTestsDevPatterns?: (component: Component) => string[];
}

export function hasCompiler(obj: Environment): obj is CompilerEnv {
  return typeof obj.getCompiler === 'function';
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
