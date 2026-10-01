import type { ComponentModel } from '@teambit/component';
import type { ReactNode } from 'react';
import React, { useRef, useEffect } from 'react';

export type SandboxPermission =
  | 'allow-downloads'
  | 'allow-forms'
  | 'allow-modals'
  | 'allow-orientation-lock'
  | 'allow-pointer-lock'
  | 'allow-popups'
  | 'allow-popups-to-escape-sandbox'
  | 'allow-presentation'
  | 'allow-same-origin'
  | 'allow-scripts'
  | 'allow-storage-access-by-user-activation'
  | 'allow-top-navigation'
  | 'allow-top-navigation-by-user-activation';

export type UseSandboxPermission = (manager: SandboxManager, component?: ComponentModel) => void;

/** Subset of iframe attributes resolvers are allowed to set on `ComponentPreview`. */
export type PreviewIframeAttrs = {
  allow?: string;
  referrerPolicy?: React.IframeHTMLAttributes<HTMLIFrameElement>['referrerPolicy'];
};

/**
 * Per-component hook for iframe-level attributes on `ComponentPreview` (`allow` for
 * Permissions Policy, `referrerPolicy`, ...). Hooks mutate the shared `PreviewPropsManager`
 * during render; later registrations win for overlapping keys. Receives the
 * `ComponentModel` so decisions can be per-component (e.g. grant `fullscreen` only to
 * components that opt in).
 */
export type UsePreviewProps = (manager: PreviewPropsManager, component?: ComponentModel) => void;

export class SandboxManager {
  private permissions: Set<SandboxPermission>;

  constructor(initialPermissions: SandboxPermission[] = []) {
    this.permissions = new Set(initialPermissions);
  }

  add(permission: SandboxPermission) {
    this.permissions.add(permission);
    return this;
  }

  remove(permission: SandboxPermission) {
    this.permissions.delete(permission);
    return this;
  }

  has(permission: SandboxPermission): boolean {
    return this.permissions.has(permission);
  }

  toString(): string {
    return Array.from(this.permissions).join(' ');
  }
}

export function SandboxPermissionExecutor({
  usePermissionHook,
  manager,
  component,
}: {
  usePermissionHook: UseSandboxPermission;
  manager: SandboxManager;
  component?: ComponentModel;
}) {
  usePermissionHook(manager, component);
  return null;
}

/**
 * Runs registered `UseSandboxPermission` hooks against a shared `SandboxManager` and passes
 * the aggregated sandbox value to `children` as a render prop. Like `PreviewPropsAggregator`,
 * computation happens synchronously within the render pass (executors are sibling children
 * that mutate the manager before the consumer reads it), so the value exists on the very
 * first commit — before the preview iframe mounts and starts its navigation. The previous
 * effect-driven flow (`onSandboxChange` firing from `useEffect`) delivered the value one
 * commit after the iframe had already started loading, and a `sandbox` attribute set on a
 * live iframe only applies to its next navigation — so the initial document kept the
 * flags it mounted with.
 */
export function SandboxPermissionsAggregator({
  hooks,
  onSandboxChange,
  component,
  children,
}: {
  hooks: UseSandboxPermission[];
  /**
   * @deprecated fires from an effect, one commit after the iframe mounts — too late for the
   * initial navigation. Use the `children` render prop instead.
   */
  onSandboxChange?: (sandboxValue: string) => void;
  component?: ComponentModel;
  children?: (sandboxValue: string) => ReactNode;
}) {
  // Fresh manager per render so a hook that stops granting a permission doesn't leak the
  // previous render's grant. Executors below mutate it in source order before
  // SandboxPermissionsConsumer reads it.
  const manager = new SandboxManager();

  return (
    <>
      {hooks.map((usePermissionHook, i) => (
        <SandboxPermissionExecutor
          key={`sanbox-permission-executor-${i}`}
          usePermissionHook={usePermissionHook}
          manager={manager}
          component={component}
        />
      ))}
      <SandboxPermissionsConsumer manager={manager} onSandboxChange={onSandboxChange}>
        {children}
      </SandboxPermissionsConsumer>
    </>
  );
}

function SandboxPermissionsConsumer({
  manager,
  onSandboxChange,
  children,
}: {
  manager: SandboxManager;
  onSandboxChange?: (sandboxValue: string) => void;
  children?: (sandboxValue: string) => ReactNode;
}) {
  const sandboxValue = manager.toString();
  useEffect(() => {
    onSandboxChange?.(sandboxValue);
  });
  return <>{children?.(sandboxValue)}</>;
}

export class PreviewPropsManager {
  private attrs: PreviewIframeAttrs = {};

  set<K extends keyof PreviewIframeAttrs>(key: K, value: PreviewIframeAttrs[K]) {
    this.attrs[key] = value;
    return this;
  }

  get<K extends keyof PreviewIframeAttrs>(key: K): PreviewIframeAttrs[K] {
    return this.attrs[key];
  }

  toAttrs(): PreviewIframeAttrs {
    return { ...this.attrs };
  }
}

export function PreviewPropsExecutor({
  usePropsHook,
  manager,
  component,
}: {
  usePropsHook: UsePreviewProps;
  manager: PreviewPropsManager;
  component?: ComponentModel;
}) {
  usePropsHook(manager, component);
  return null;
}

function shallowEqualAttrs(a: PreviewIframeAttrs, b: PreviewIframeAttrs): boolean {
  const aKeys = Object.keys(a) as Array<keyof PreviewIframeAttrs>;
  const bKeys = Object.keys(b) as Array<keyof PreviewIframeAttrs>;
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => a[k] === b[k]);
}

/**
 * Runs registered `UsePreviewProps` hooks against a shared `PreviewPropsManager` and
 * passes the resulting iframe attrs to `children` as a render prop. Computation happens
 * synchronously within the render pass (executors are sibling children that mutate the
 * manager before the consumer reads it), so there is no state hop and no chance of the
 * effect-driven re-render loop that the previous implementation triggered. The attrs
 * reference is stabilized via shallow-equal — unrelated parent re-renders keep the same
 * identity, so `{...attrs}` spreads only invalidate downstream when content really changes.
 */
export function PreviewPropsAggregator({
  hooks,
  component,
  children,
}: {
  hooks: UsePreviewProps[];
  component?: ComponentModel;
  children: (attrs: PreviewIframeAttrs) => ReactNode;
}) {
  // Fresh manager per render so a hook that stops setting a key doesn't leak the
  // previous render's value. Executors below mutate this manager in source order
  // before PreviewPropsConsumer reads it.
  const manager = new PreviewPropsManager();
  return (
    <>
      {hooks.map((usePropsHook, i) => (
        <PreviewPropsExecutor
          key={`preview-props-executor-${i}`}
          usePropsHook={usePropsHook}
          manager={manager}
          component={component}
        />
      ))}
      <PreviewPropsConsumer manager={manager}>{children}</PreviewPropsConsumer>
    </>
  );
}

function PreviewPropsConsumer({
  manager,
  children,
}: {
  manager: PreviewPropsManager;
  children: (attrs: PreviewIframeAttrs) => ReactNode;
}) {
  const next = manager.toAttrs();
  const stableRef = useRef<PreviewIframeAttrs>(next);
  if (!shallowEqualAttrs(stableRef.current, next)) {
    stableRef.current = next;
  }
  return <>{children(stableRef.current)}</>;
}
