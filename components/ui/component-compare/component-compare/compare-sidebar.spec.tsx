import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { CompareSidebar } from './compare-sidebar';
import type { CompareSidebarGroup } from './compare-sidebar';

// the icon set pulls a large graph and renders nothing this suite asserts on
// `virtual`: the icon package is not resolvable in this env's jest sandbox, and the suite asserts
// on the sidebar's structure rather than on any glyph it renders.
jest.mock('@teambit/design.elements.icon', () => ({ Icon: () => null }), { virtual: true });

const STORAGE_KEY = 'bit.compare.sidebar.collapsed';

const groups: CompareSidebarGroup[] = [
  {
    key: 'modified',
    label: 'Modified',
    items: [
      { id: 'scope/a', name: 'a', files: [{ name: 'index.ts', status: 'MODIFIED' }] as any },
      { id: 'scope/b', name: 'b' },
    ],
  },
];

const toggleOf = (container: HTMLElement) =>
  container.querySelector('[aria-label*="components sidebar"]') as HTMLElement;

beforeEach(() => localStorage.clear());

describe('CompareSidebar collapse', () => {
  it('starts expanded and exposes a collapse control', () => {
    const { container } = render(<CompareSidebar groups={groups} onSelect={() => {}} />);
    expect(container.querySelector('[data-collapsed]')).toBeNull();
    expect(toggleOf(container).getAttribute('aria-label')).toBe('Collapse components sidebar');
  });

  it('collapses on toggle and remembers the choice', () => {
    const { container } = render(<CompareSidebar groups={groups} onSelect={() => {}} />);
    fireEvent.click(toggleOf(container));

    expect(container.querySelector('[data-collapsed]')).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('restores a remembered collapse on the next mount', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { container } = render(<CompareSidebar groups={groups} onSelect={() => {}} />);
    expect(container.querySelector('[data-collapsed]')).not.toBeNull();
  });

  it('scopes the memory to the supplied storage key', () => {
    const { container } = render(
      <CompareSidebar groups={groups} onSelect={() => {}} collapseStorageKey="lane.sidebar" />
    );
    fireEvent.click(toggleOf(container));

    expect(localStorage.getItem('lane.sidebar')).toBe('true');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps the component list mounted while collapsed so file trees keep their state', () => {
    // hiding the list with CSS rather than unmounting it is what stops a collapse/expand round trip
    // from throwing away every expanded file tree
    localStorage.setItem(STORAGE_KEY, 'true');
    const { getByText } = render(<CompareSidebar groups={groups} onSelect={() => {}} />);
    expect(getByText('a')).toBeTruthy();
  });

  it('defers to the caller when collapse is controlled', () => {
    const changes: boolean[] = [];
    const { container } = render(
      <CompareSidebar
        groups={groups}
        onSelect={() => {}}
        collapsed={false}
        onCollapsedChange={(c) => changes.push(c)}
      />
    );
    fireEvent.click(toggleOf(container));

    expect(changes).toEqual([true]);
    // a controlled sidebar must not write a preference the owner never asked to persist
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(container.querySelector('[data-collapsed]')).toBeNull();
  });
});
