import type { Component } from './component';

/**
 * the part of the dependency-resolver aspect that envs use. get it with
 * `context.getAspect<DependencyResolverMain>(DEPENDENCY_RESOLVER_ASPECT_ID)`.
 */
export interface DependencyResolverMain {
  /**
   * the package name of a component.
   */
  getPackageName(component: Component): string;

  /**
   * the dirs the package manager injected a component's package into (e.g. pnpm's injected dependencies).
   */
  getInjectedDirs(rootDir: string, componentDir: string, packageName: string): Promise<string[]>;
}
