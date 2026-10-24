import { useEffect, useRef } from 'react';

export type UrlSelection = {
  /** component id without version, from `?componentId=` */
  componentId?: string;
  /** file or API export name, from `?file=` */
  file?: string;
};

export type UseUrlSelectionOptions = {
  selection: UrlSelection;
  /** while true the diff pane is a skeleton and there is nothing to scroll to */
  loading: boolean;
  /** adopt a selection that arrived after mount. Not called for the mount-time value. */
  apply: (selection: UrlSelection) => void;
  /**
   * Scroll to the selection. Returns false if it could not (the pane is not mounted yet), in which
   * case the request is kept and retried. `signal` is aborted when a newer selection supersedes this
   * one — honour it before scrolling, and to tear down anything still waiting for a lazy anchor.
   */
  scrollTo: (selection: UrlSelection & { componentId: string }, signal: AbortSignal) => boolean;
};

const keyOf = (selection: UrlSelection) => `${selection.componentId ?? ''}|${selection.file ?? ''}`;

/**
 * Keeps the compare view's selection in step with the URL, and scrolls to it.
 *
 * Two things arrive through the same door: the selection present at mount (a deep link, a page
 * reload) and one that arrives later (a host linking to a component, a link into a discussion
 * attached to one). Both are handled here rather than in separate effects — as separate effects they
 * raced, because each scroll waits up to five seconds for a lazily mounted anchor and the older wait
 * could resolve last and scroll the pane back.
 *
 * Only the post-mount case calls `apply`; at mount the caller has already seeded its state from the
 * URL, and re-applying it would fight a selection the reader made before the diff finished loading.
 *
 * Note this deliberately reacts to *changes* in the parameters. lane-compare writes its own selection
 * with `history.replaceState`, which react-router does not observe, so a change seen here can only
 * have come from a real navigation.
 */
export function useUrlSelection({ selection, loading, apply, scrollTo }: UseUrlSelectionOptions) {
  const currentKey = keyOf(selection);
  const lastSeenKey = useRef(currentKey);
  // seeded so a deep link scrolls once the diff has loaded, without a second effect to race with
  const pending = useRef<UrlSelection | undefined>(selection.componentId ? selection : undefined);
  const inFlight = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    if (currentKey === lastSeenKey.current) return;
    lastSeenKey.current = currentKey;
    apply(selection);
    // every change replaces the pending target, including clearing it — a selection that is set and
    // then removed while the diff reloads must not scroll to the component it used to name.
    pending.current = selection.componentId ? selection : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  useEffect(() => {
    const target = pending.current;
    if (!target?.componentId || loading) return;

    // supersede whatever is still waiting for an earlier destination's anchor, so it cannot scroll
    // the pane back once that anchor finally mounts.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    // keep the request if the pane is not mounted yet; the next loading change retries it
    if (scrollTo({ ...target, componentId: target.componentId }, controller.signal)) {
      pending.current = undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, loading]);

  useEffect(() => () => inFlight.current?.abort(), []);
}
