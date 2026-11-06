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

  it('does not arm the width transition in the same commit as the restored state', () => {
    // both landing together makes the browser animate 280px -> 36px on every reload, which is the
    // "slides shut on load" this feature is supposed to avoid.
    localStorage.setItem(STORAGE_KEY, 'true');
    const { container } = render(<CompareSidebar groups={groups} onSelect={() => {}} />);

    const sidebar = container.querySelector('[data-collapsed]') as HTMLElement;
    expect(sidebar).not.toBeNull();
    expect(sidebar.className).not.toMatch(/animated/);
  });

  it('falls back to the default when moved to a scope with nothing stored', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { container, rerender } = render(<CompareSidebar groups={groups} onSelect={() => {}} />);
    expect(container.querySelector('[data-collapsed]')).not.toBeNull();

    rerender(<CompareSidebar groups={groups} onSelect={() => {}} collapseStorageKey="a-fresh-scope" />);
    // the previous scope's preference must not carry over into one that has never been set
    expect(container.querySelector('[data-collapsed]')).toBeNull();
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
