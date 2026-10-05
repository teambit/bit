// TODO: @gilad refactor to an abstract env.
import type { Component } from '@teambit/component';

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

// the interfaces below describe the legacy getter-style env API (getCompiler(), getBuildPipe(), etc.).
// they are kept for backward compatibility only. they don't reference the service types, because the
// services depend on envs, and importing their types here creates circular dependencies.
// the typed contracts live in each service aspect, using the handler-style API.

/**
 * @deprecated the getter-style env API is deprecated. set the dependencies policy in env.jsonc, and
 * implement `detectors()` instead of `getDepDetectors()`, see `DependencyEnv` from `@teambit/dependency-resolver`.
 */
export interface DependenciesEnv extends Environment {}

/**
 * @deprecated the getter-style env API is deprecated. implement `package()` instead, see `PackageEnv` from `@teambit/pkg`.
 */
export interface PackageEnv extends Environment {}

/**
 * @deprecated use `GetNpmIgnoreContext` from `@teambit/pkg`.
 */
export type GetNpmIgnoreContext = {
  capsule: any;
  component: Component;
};

/**
 * @deprecated the getter-style env API is deprecated. implement `linter()` instead, see `LinterEnv` from `@teambit/linter`.
 */
export interface LinterEnv extends Environment {}

/**
 * @deprecated the getter-style env API is deprecated. implement `formatter()` instead, see `FormatterEnv` from `@teambit/formatter`.
 */
export interface FormatterEnv extends Environment {}

/**
 * @deprecated the getter-style env API is deprecated. implement `preview()` instead, see `PreviewEnv` from `@teambit/preview`.
 */
export interface PreviewEnv extends Environment {}

export type PipeServiceModifiersMap = Record<string, PipeServiceModifier>;

export interface PipeServiceModifier {
  transformers?: Function[];
  module?: any;
}

/**
 * @deprecated the getter-style env API is deprecated. implement `build()`, `snap()` and `tag()` instead,
 * see `BuilderEnv` from `@teambit/builder`.
 */
export interface BuilderEnv extends PreviewEnv {}

/**
 * @deprecated the getter-style env API is deprecated. implement `tester()` instead, see `TesterEnv` from `@teambit/tester`.
 */
export interface TesterEnv extends Environment {}

/**
 * @deprecated the getter-style env API is deprecated. implement `compiler()` instead, see `CompilerEnv` from `@teambit/compiler`.
 */
export interface CompilerEnv extends Environment {}

export function hasCompiler(obj: Environment): obj is CompilerEnv {
  return typeof obj.getCompiler === 'function';
}

/**
 * @deprecated the getter-style env API is deprecated. implement `preview()` instead, its `getDevServer()` and
 * `getDevEnvId()` replace these ones, see `PreviewEnv` from `@teambit/preview`.
 */
export interface DevEnv extends PreviewEnv {}
