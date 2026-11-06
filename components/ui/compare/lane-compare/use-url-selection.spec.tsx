import { renderHook } from '@testing-library/react';
import { useUrlSelection } from './use-url-selection';
import type { UrlSelection } from './use-url-selection';

type Scroll = { selection: UrlSelection; signal: AbortSignal };

function setup(initial: UrlSelection, loading = false, canScroll = true) {
  const applied: UrlSelection[] = [];
  const scrolls: Scroll[] = [];

  const view = renderHook(
    ({ selection, loading: isLoading }: { selection: UrlSelection; loading: boolean }) =>
      useUrlSelection({
        selection,
        loading: isLoading,
        apply: (next) => applied.push(next),
        scrollTo: (target, signal) => {
          if (!canScroll) return false;
          scrolls.push({ selection: target, signal });
          return true;
        },
      }),
    { initialProps: { selection: initial, loading } }
  );

  return { applied, scrolls, view };
}

describe('useUrlSelection', () => {
  it('scrolls to a selection present at mount, without re-applying it', () => {
    const { applied, scrolls } = setup({ componentId: 'scope/a', file: 'index.ts' });

    // the caller already seeded its state from the URL; applying it again would overwrite a
    // selection the reader made while the diff was still loading
    expect(applied).toEqual([]);
    expect(scrolls.map((s) => s.selection)).toEqual([{ componentId: 'scope/a', file: 'index.ts' }]);
  });

  it('adopts a selection that arrives after mount', () => {
    const { applied, scrolls, view } = setup({});
    expect(scrolls).toHaveLength(0);

    view.rerender({ selection: { componentId: 'scope/b' }, loading: false });

    expect(applied).toEqual([{ componentId: 'scope/b' }]);
    expect(scrolls.map((s) => s.selection.componentId)).toEqual(['scope/b']);
  });

  it('defers the scroll until the diff has loaded', () => {
    const { scrolls, view } = setup({}, true);

    view.rerender({ selection: { componentId: 'scope/b' }, loading: true });
    expect(scrolls).toHaveLength(0);

    view.rerender({ selection: { componentId: 'scope/b' }, loading: false });
    expect(scrolls.map((s) => s.selection.componentId)).toEqual(['scope/b']);
  });

  it('retries when the pane was not mounted yet', () => {
    const applied: UrlSelection[] = [];
    const scrolls: UrlSelection[] = [];
    let paneReady = false;

    const view = renderHook(
      ({ selection, loading }: { selection: UrlSelection; loading: boolean }) =>
        useUrlSelection({
          selection,
          loading,
          apply: (next) => applied.push(next),
          scrollTo: (target) => {
            if (!paneReady) return false;
            scrolls.push(target);
            return true;
          },
        }),
      { initialProps: { selection: { componentId: 'scope/a' } as UrlSelection, loading: true } }
    );

    view.rerender({ selection: { componentId: 'scope/a' }, loading: false });
    expect(scrolls).toHaveLength(0);

    paneReady = true;
    view.rerender({ selection: { componentId: 'scope/a' }, loading: true });
    view.rerender({ selection: { componentId: 'scope/a' }, loading: false });
    expect(scrolls.map((s) => s.componentId)).toEqual(['scope/a']);
  });

  it('forgets a pending target when the selection is cleared while loading', () => {
    const { scrolls, view } = setup({}, false);

    view.rerender({ selection: { componentId: 'scope/b' }, loading: true });
    view.rerender({ selection: {}, loading: true });
    view.rerender({ selection: {}, loading: false });

    // the URL no longer names a component; scrolling to the one it used to name is a jump the reader
    // never asked for
    expect(scrolls).toHaveLength(0);
  });

  it('aborts a superseded scroll so its late anchor cannot win', () => {
    const { scrolls, view } = setup({});

    view.rerender({ selection: { componentId: 'scope/b', file: 'a.ts' }, loading: false });
    view.rerender({ selection: { componentId: 'scope/c', file: 'b.ts' }, loading: false });

    expect(scrolls.map((s) => s.selection.componentId)).toEqual(['scope/b', 'scope/c']);
    expect(scrolls[0].signal.aborted).toBe(true);
    expect(scrolls[1].signal.aborted).toBe(false);
  });

  it('aborts the outstanding scroll on unmount', () => {
    const { scrolls, view } = setup({ componentId: 'scope/a' });

    expect(scrolls[0].signal.aborted).toBe(false);
    view.unmount();
    expect(scrolls[0].signal.aborted).toBe(true);
  });
});
