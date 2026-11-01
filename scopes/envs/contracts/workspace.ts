import type { ComponentID } from '@teambit/component-id';
import type { Component } from './component';

/**
 * the parts of the workspace aspect that envs use, e.g. a dev server that resolves component
 * directories. get it with `context.getAspect<Workspace>(WORKSPACE_ASPECT_ID)`. it is undefined when
 * the env runs in a scope.
 */
export interface Workspace {
  /**
   * absolute path of the workspace.
   */
  readonly path: string;

  /**
   * absolute path of the root components directory.
   */
  readonly rootComponentsPath: string;

  list(): Promise<Component[]>;

  listIds(): ComponentID[];

  get(componentId: ComponentID): Promise<Component>;

  getMany(ids: ComponentID[]): Promise<Component[]>;

  hasId(componentId: ComponentID): boolean;

  isExported(id: ComponentID): boolean;

  /**
   * directory of the component, absolute unless `options.relative` is true.
   */
  componentDir(componentId: ComponentID, bitMapOptions?: unknown, options?: { relative: boolean }): string;

  /**
   * directory of the component's package in node_modules.
   */
  componentPackageDir(component: Component, options?: { relative: boolean }): string;

  /**
   * a temp directory in the workspace for the given key, e.g. an aspect id.
   */
  getTempDir(id: string): string;

  getComponentPathsRegExps(): RegExp[];

  resolveComponentIdFromPackageName(packageName: string, keepOriginalVersion?: boolean): Promise<ComponentID>;

  getInjectedDirs(component: Component): Promise<string[]>;
}
