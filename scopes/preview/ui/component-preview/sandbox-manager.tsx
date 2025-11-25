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
