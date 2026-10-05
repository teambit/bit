import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { render } from '@testing-library/react';
import type { SandboxManager, UseSandboxPermission } from './sandbox-manager';
import { SandboxPermissionsAggregator } from './sandbox-manager';

const grantScriptsAndOrigin: UseSandboxPermission = (manager: SandboxManager) => {
  manager.add('allow-scripts');
  manager.add('allow-same-origin');
};

function SandboxedIframe({ hooks }: { hooks: UseSandboxPermission[] }) {
  return (
    <SandboxPermissionsAggregator hooks={hooks}>
      {(sandboxValue) => (
        <iframe title="preview" src="https://preview.example/component" sandbox={sandboxValue || undefined} />
      )}
    </SandboxPermissionsAggregator>
  );
}

describe('SandboxPermissionsAggregator', () => {
  it('mounts the iframe with the sandbox attribute already present in the first DOM commit', () => {
    // the sandbox attribute only applies when an iframe navigates, and navigation starts the
    // moment the element is committed with a `src` — so the attribute must be there at first
    // commit, before any effect runs. flushSync commits the render without flushing effects,
    // which is exactly that moment.
    const actEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      flushSync(() => {
        root.render(<SandboxedIframe hooks={[grantScriptsAndOrigin]} />);
      });
      const iframe = container.querySelector('iframe');
      expect(iframe).not.toBeNull();
      expect(iframe?.getAttribute('src')).toBe('https://preview.example/component');
      expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    } finally {
      root.unmount();
      container.remove();
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = actEnvironment;
    }
  });

  it('never sets the sandbox attribute after the iframe is in the DOM', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const observer = new MutationObserver(() => {});
    observer.observe(container, { subtree: true, childList: true, attributes: true, attributeOldValue: true });
    try {
      const { unmount } = render(<SandboxedIframe hooks={[grantScriptsAndOrigin]} />, { container });
      const sandboxMutations = observer
        .takeRecords()
        .filter((record) => record.type === 'attributes' && record.attributeName === 'sandbox');
      // an attribute mutation after insertion would mean the sandbox arrived too late to
      // apply to the document already loading in the iframe
      expect(sandboxMutations).toHaveLength(0);
      expect(container.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
      unmount();
    } finally {
      observer.disconnect();
      container.remove();
    }
  });

  it('still reports the aggregated value through onSandboxChange', () => {
    const reported: string[] = [];
    render(<SandboxPermissionsAggregator hooks={[grantScriptsAndOrigin]} onSandboxChange={(v) => reported.push(v)} />);
    expect(reported).toContain('allow-scripts allow-same-origin');
  });

  it('drops permissions a hook stops granting on re-render', () => {
    let grantSameOrigin = true;
    const hook: UseSandboxPermission = (manager: SandboxManager) => {
      manager.add('allow-scripts');
      if (grantSameOrigin) manager.add('allow-same-origin');
    };
    const values: string[] = [];
    const probe = (
      <SandboxPermissionsAggregator hooks={[hook]}>
        {(sandboxValue) => {
          values.push(sandboxValue);
          return null;
        }}
      </SandboxPermissionsAggregator>
    );
    const { rerender } = render(probe);
    expect(values[values.length - 1]).toBe('allow-scripts allow-same-origin');
    grantSameOrigin = false;
    rerender(React.cloneElement(probe));
    expect(values[values.length - 1]).toBe('allow-scripts');
  });
});
