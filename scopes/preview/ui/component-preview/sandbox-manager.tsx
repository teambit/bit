import type { ComponentModel } from '@teambit/component';
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

export function SandboxPermissionsAggregator({
  hooks,
  onSandboxChange,
  component,
}: {
  hooks: UseSandboxPermission[];
  onSandboxChange?: (sandboxValue: string) => void;
  component?: ComponentModel;
}) {
  const managerRef = useRef(new SandboxManager());

  useEffect(() => {
    onSandboxChange?.(managerRef.current.toString());
  });

  return (
    <>
      {hooks.map((usePermissionHook, i) => (
        <SandboxPermissionExecutor
          key={`sanbox-permission-executor-${i}`}
          usePermissionHook={usePermissionHook}
          manager={managerRef.current}
          component={component}
        />
      ))}
    </>
  );
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

export function PreviewPropsAggregator({
  hooks,
  onPreviewPropsChange,
  component,
}: {
  hooks: UsePreviewProps[];
  onPreviewPropsChange?: (attrs: PreviewIframeAttrs) => void;
  component?: ComponentModel;
}) {
  const managerRef = useRef(new PreviewPropsManager());

  useEffect(() => {
    onPreviewPropsChange?.(managerRef.current.toAttrs());
  });

  return (
    <>
      {hooks.map((usePropsHook, i) => (
        <PreviewPropsExecutor
          key={`preview-props-executor-${i}`}
          usePropsHook={usePropsHook}
          manager={managerRef.current}
          component={component}
        />
      ))}
    </>
  );
}
