import React from 'react';
import { render } from '@testing-library/react';
import { ComponentCompareHeader, InlineComponentCompare } from './component-compare';
import type { ComponentActionsContext } from './component-compare';

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

  it('asks the host for actions with the identity of the component being rendered', () => {
    const calls: ComponentActionsContext[] = [];

    render(
      <InlineComponentCompare
        name="button"
        baseId="teambit.base-ui/button@1.0.0"
        compareId="teambit.base-ui/button@2.0.0"
        renderActions={(context) => {
          calls.push(context);
          return <span>action</span>;
        }}
      />
    );

    expect(calls).toEqual([
      {
        name: 'button',
        // without the version: the stable identity of the row, which is what a host keys its own
        // per-component data (reviews, feedback threads) by
        componentId: 'teambit.base-ui/button',
        baseId: 'teambit.base-ui/button@1.0.0',
        compareId: 'teambit.base-ui/button@2.0.0',
      },
    ]);
  });

  it('renders what the host returned', () => {
    const { getByText } = render(
      <InlineComponentCompare
        name="button"
        baseId="teambit.base-ui/button@1.0.0"
        compareId="teambit.base-ui/button@2.0.0"
        renderActions={() => <span>3 open</span>}
      />
    );
    expect(getByText('3 open')).toBeTruthy();
  });
});
