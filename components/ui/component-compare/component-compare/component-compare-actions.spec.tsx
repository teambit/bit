import React from 'react';
import { render } from '@testing-library/react';
import { ComponentCompareHeader, InlineComponentCompare } from './component-compare';
import { useComponentCompareIdentity } from './component-identity-context';
import type { ComponentCompareIdentity } from './component-identity-context';

// component-compare pulls in the API diff view, which pulls in shiki — an ESM-only package that
// jest's transform does not process. None of it is reachable in this suite (panels stay unmounted,
// see the observer stub below), so it is replaced wholesale.
jest.mock('@teambit/semantics.ui.api-diff-view', () => ({ useApiDiff: () => ({}) }));

// jsdom has no IntersectionObserver, and InlineComponentCompare uses one to defer mounting its
// panels. A stub that never reports an intersection is exactly the state this suite wants: only the
// header is rendered, which is where host actions live.
beforeAll(() => {
  (globalThis as any).IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

describe('host-contributed component actions', () => {
  it('renders the host actions in the header', () => {
    const { getByText } = render(
      <ComponentCompareHeader name="button" actions={<button type="button">Discuss</button>} />
    );
    expect(getByText('Discuss')).toBeTruthy();
  });

  it('adds no markup when the host contributes nothing', () => {
    const { container } = render(<ComponentCompareHeader name="button" />);
    expect(container.querySelector('[class*="headerActions"]')).toBeNull();
  });

  it('tells the actions component which component it is in, without being handed it', () => {
    // the point of the context: the host writes a plain component and reads identity from a hook,
    // rather than lane-compare threading a context object down through every panel.
    const seen: Array<ComponentCompareIdentity | undefined> = [];

    function Actions() {
      seen.push(useComponentCompareIdentity());
      return <span>action</span>;
    }

    const { getByText } = render(
      <InlineComponentCompare
        name="button"
        baseId="teambit.base-ui/button@1.0.0"
        compareId="teambit.base-ui/button@2.0.0"
        HeaderActions={Actions}
      />
    );

    expect(getByText('action')).toBeTruthy();
    expect(seen[0]).toEqual({
      name: 'button',
      // without the version: the stable identity of the component, which is what a host keys its own
      // per-component data (reviews, feedback threads) by
      componentId: 'teambit.base-ui/button',
      baseId: 'teambit.base-ui/button@1.0.0',
      compareId: 'teambit.base-ui/button@2.0.0',
    });
  });

  it('leaves the identity undefined outside a compare panel', () => {
    let seen: ComponentCompareIdentity | undefined | 'unset' = 'unset';
    function Probe() {
      seen = useComponentCompareIdentity();
      return null;
    }
    render(<Probe />);
    expect(seen).toBeUndefined();
  });
});
