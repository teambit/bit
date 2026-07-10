import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentModel } from '@teambit/component';
import { ComponentTree } from './component-tree';

/**
 * NOTE: These compositions may fail to render in local dev environments where
 * @teambit/component resolves to the Bit CLI's own copy (e.g. ~/.bvm/...).
 * That copy's useIdFromLocation calls useSearchParams from its bundled
 * react-router-dom, which is a different instance from the MemoryRouter here,
 * causing a "useLocation outside Router" error. In the core repo and on
 * bit.cloud previews, both resolve to the same instance so it works correctly.
 */

function mockComponent(id: string, scope: string, namespace?: string): ComponentModel {
  const fullName = namespace ? `${namespace}/${id}` : id;
  const fullId = `${scope}/${fullName}`;
  return {
    id: {
      scope,
      fullName,
      toString: ({ ignoreVersion }: { ignoreVersion?: boolean } = {}) => fullId,
      toStringWithoutVersion: () => fullId,
      toObject: () => ({ scope, name: fullName }),
    },
    environment: { id: 'teambit.react/react-env' },
    status: {
      isNew: false,
      modifyInfo: { hasModifiedFiles: false, hasModifiedDependencies: false },
    },
  } as unknown as ComponentModel;
}

const componentsWithScopes: ComponentModel[] = [
  mockComponent('button', 'acme.design', 'ui'),
  mockComponent('card', 'acme.design', 'ui'),
  mockComponent('input', 'acme.design', 'ui/forms'),
  mockComponent('checkbox', 'acme.design', 'ui/forms'),
  mockComponent('use-auth', 'acme.auth', 'hooks'),
  mockComponent('user', 'acme.auth', 'entities'),
];

const componentsFlat: ComponentModel[] = [
  mockComponent('button', 'acme.design'),
  mockComponent('card', 'acme.design'),
  mockComponent('modal', 'acme.design'),
];

const componentsModified: ComponentModel[] = [
  {
    ...mockComponent('button', 'acme.design', 'ui'),
    status: {
      isNew: false,
      modifyInfo: { hasModifiedFiles: true, hasModifiedDependencies: false },
    },
  } as unknown as ComponentModel,
  mockComponent('card', 'acme.design', 'ui'),
];

export const BasicComponentTree = () => (
  <MemoryRouter>
    <div style={{ width: 280, background: 'var(--bit-bg-dent, #f5f6f8)', minHeight: 300 }}>
      <ComponentTree components={componentsWithScopes} />
    </div>
  </MemoryRouter>
);

export const FlatComponents = () => (
  <MemoryRouter>
    <div style={{ width: 280, background: 'var(--bit-bg-dent, #f5f6f8)', minHeight: 200 }}>
      <ComponentTree components={componentsFlat} />
    </div>
  </MemoryRouter>
);

export const CollapsedTree = () => (
  <MemoryRouter>
    <div style={{ width: 280, background: 'var(--bit-bg-dent, #f5f6f8)', minHeight: 300 }}>
      <ComponentTree components={componentsWithScopes} isCollapsed />
    </div>
  </MemoryRouter>
);

export const WithModifiedComponent = () => (
  <MemoryRouter>
    <div style={{ width: 280, background: 'var(--bit-bg-dent, #f5f6f8)', minHeight: 200 }}>
      <ComponentTree components={componentsModified} />
    </div>
  </MemoryRouter>
);

export const EmptyTree = () => (
  <MemoryRouter>
    <div style={{ width: 280, background: 'var(--bit-bg-dent, #f5f6f8)', minHeight: 100 }}>
      <ComponentTree components={[]} />
    </div>
  </MemoryRouter>
);
