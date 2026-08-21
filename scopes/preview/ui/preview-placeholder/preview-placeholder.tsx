import type { ComponentType, ReactNode } from 'react';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { CompositionsAspect, ComponentComposition, Composition } from '@teambit/compositions';
import { H3, H5 } from '@teambit/design.ui.heading';
import { capitalize } from '@teambit/toolbox.string.capitalize';
import type { ComponentModel } from '@teambit/component';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import { DocsAspect } from '@teambit/docs';
import styles from './preview-placeholder.module.scss';

// Keep a lightweight in-memory warm set so previews that were already hydrated once
// can remount immediately without waiting for intersection again.
const warmedPreviews = new Set<string>();
const autoWarmPreviews = new Set<string>();
function getHydrationConcurrency() {
  if (typeof navigator === 'undefined') return 6;
  const cores = navigator.hardwareConcurrency || 6;
  if (cores <= 4) return 4;
  if (cores <= 8) return 6;
  return 8;
}

const HYDRATION_CONCURRENCY = getHydrationConcurrency();
const HYDRATION_SLOT_FALLBACK_RELEASE_MS = 1800;
const AUTO_WARM_PREVIEW_LIMIT = Math.max(16, HYDRATION_CONCURRENCY * 3);

// Every hydrated preview is an <iframe>, and every iframe is its own JS realm that parses and runs
// the env's preview bundle. The hydration queue above bounds how *fast* previews mount, but nothing
// bounded how *many* stayed mounted: scrolling a large workspace grew the live set monotonically
// (measured on a 194-component workspace: 9 -> 25 -> 41 -> 57 -> 73 -> 79 iframes over eight scroll
// steps, never shrinking). Keep a bounded window of live realms and retire the ones furthest from
// the viewport - `warmedPreviews` means a retired preview re-mounts without waiting for a slot, and
// its assets come from the browser cache.
function getMaxLivePreviews() {
  const fallback = Math.max(24, HYDRATION_CONCURRENCY * 4);
  if (typeof window === 'undefined') return fallback;
  // escape hatch, and the knob that makes this measurable: `?maxLivePreviews=999` keeps every
  // preview alive (the old behaviour) so a before/after can be run against one build and one server
  const raw = new URLSearchParams(window.location.search).get('maxLivePreviews');
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_LIVE_PREVIEWS = getMaxLivePreviews();
// Don't retire anything within this many pixels of the viewport, so scrolling never blanks a card
// the user can see or is about to see. It must stay above the observer's `rootMargin` below,
// otherwise a preview would be retired while still inside the band that re-triggers hydration and
// the two would fight each other.
const LIVE_PREVIEW_KEEP_MARGIN_PX = 2000;

// A retired preview keeps its `warmedPreviews` entry (so re-mounting skips the queue) but must go
// back through intersection before it re-mounts - otherwise the auto-warm fast path below would
// re-hydrate it the moment it was retired.
const retiredPreviews = new Set<string>();

type LivePreview = { previewKey: string; getTop: () => number | undefined; retire: () => void };
const livePreviews = new Map<string, LivePreview>();

function distanceFromViewport(entry: LivePreview): number {
  const top = entry.getTop();
  if (top === undefined) return Number.POSITIVE_INFINITY;
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  if (top >= 0 && top <= viewportHeight) return 0;
  return top < 0 ? -top : top - viewportHeight;
}

function registerLivePreview(entry: LivePreview) {
  livePreviews.set(entry.previewKey, entry);
  if (livePreviews.size <= MAX_LIVE_PREVIEWS) return;

  // retire the furthest-away previews until we are back within budget. anything still near the
  // viewport is never a candidate, so an over-budget screenful simply stays live.
  const candidates = [...livePreviews.values()]
    .map((live) => ({ live, distance: distanceFromViewport(live) }))
    .filter(({ distance }) => distance > LIVE_PREVIEW_KEEP_MARGIN_PX)
    .sort((a, b) => b.distance - a.distance);

  for (const { live } of candidates) {
    if (livePreviews.size <= MAX_LIVE_PREVIEWS) break;
    livePreviews.delete(live.previewKey);
    live.retire();
  }
}

function unregisterLivePreview(previewKey: string) {
  livePreviews.delete(previewKey);
}
const hydrationQueue: Array<{ previewKey: string; run: () => void; priority: number; seq: number }> = [];
const queuedPreviewKeys = new Set<string>();
let activeHydrationSlots = 0;
let hydrationSeq = 0;

function processHydrationQueue() {
  while (activeHydrationSlots < HYDRATION_CONCURRENCY && hydrationQueue.length > 0) {
    const next = hydrationQueue.shift();
    if (!next) break;
    queuedPreviewKeys.delete(next.previewKey);
    activeHydrationSlots += 1;
    next.run();
  }
}

function requestHydrationSlot(previewKey: string, run: () => void, priority = 0) {
  if (!previewKey) return;
  if (warmedPreviews.has(previewKey)) {
    run();
    return;
  }
  if (activeHydrationSlots < HYDRATION_CONCURRENCY) {
    activeHydrationSlots += 1;
    run();
    return;
  }
  if (queuedPreviewKeys.has(previewKey)) return;

  queuedPreviewKeys.add(previewKey);
  hydrationQueue.push({ previewKey, run, priority, seq: hydrationSeq++ });
  hydrationQueue.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
}

function reserveAutoWarmPreview(previewKey: string) {
  if (!previewKey) return false;
  if (autoWarmPreviews.has(previewKey)) return true;
  if (autoWarmPreviews.size >= AUTO_WARM_PREVIEW_LIMIT) return false;
  autoWarmPreviews.add(previewKey);
  return true;
}

function releaseHydrationSlot() {
  if (activeHydrationSlots > 0) {
    activeHydrationSlots -= 1;
  }
  processHydrationQueue();
}

function getNearestScrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement || null;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY || '';
    if (overflowY.includes('auto') || overflowY.includes('scroll')) return current;
    current = current.parentElement;
  }
  return null;
}

export function getCompositions(component: ComponentDescriptor) {
  const entry: any = component.get(CompositionsAspect.id);
  if (!entry) return [];
  const compositions = entry.data.compositions;
  if (!compositions) return [];
  return Composition.fromArray(compositions);
}

export function getDisplayName(component: ComponentDescriptor) {
  const tokens = component.id.name.split('-').map((token) => capitalize(token));
  return tokens.join(' ');
}

function getDocsProperty(component: ComponentDescriptor, name: string) {
  const docs = component.get<any>(DocsAspect.id)?.data || {};
  if (!docs || !docs?.doc?.props) return undefined;
  const docProps = docs.doc.props;
  return docProps.find((prop) => prop.name === name);
}

export function getDescription(component: ComponentDescriptor) {
  const descriptionItem = getDocsProperty(component, 'description');
  if (!descriptionItem) return '';
  return descriptionItem.value || '';
}

export function PreviewPlaceholder({
  component,
  componentDescriptor,
  Container = ({ children, className }) => <div className={className}>{children}</div>,
  shouldShowPreview = (component?.compositions.length ?? 0) > 0 && component?.buildStatus !== 'pending',
}: {
  component?: ComponentModel;
  componentDescriptor?: ComponentDescriptor;
  Container?: ComponentType<{ component: any; children: ReactNode; className: string }>;
  shouldShowPreview?: boolean;
}) {
  const compositions = component?.compositions;
  const description = componentDescriptor && getDescription(componentDescriptor);
  const displayName = componentDescriptor && getDisplayName(componentDescriptor);
  const serverUrl = component?.server?.url;
  const isServerCompiling = (component?.server as { isCompiling?: boolean } | undefined)?.isCompiling === true;
  const previewKey = component?.id?.toString?.() || componentDescriptor?.id?.toString?.() || '';
  const intersectionRef = useRef<HTMLDivElement>(null);
  const [canHydratePreview, setCanHydratePreview] = useState(() => !!previewKey && warmedPreviews.has(previewKey));
  const slotHeldRef = useRef(false);
  const slotReleaseTimerRef = useRef<number | undefined>(undefined);
  // tracks the *component* lifetime. the `isMounted` flag inside the hydration effect below only
  // tracks that effect run, and the effect re-runs as soon as hydration flips its own dependency -
  // so a callback that outlives the effect (like `retire`) has to consult this instead.
  const componentMountedRef = useRef(true);

  const clearSlotReleaseTimer = () => {
    if (!slotReleaseTimerRef.current) return;
    window.clearTimeout(slotReleaseTimerRef.current);
    slotReleaseTimerRef.current = undefined;
  };

  const releaseSlotIfHeld = () => {
    clearSlotReleaseTimer();
    if (!slotHeldRef.current) return;
    slotHeldRef.current = false;
    releaseHydrationSlot();
  };

  useEffect(() => {
    if (!previewKey || canHydratePreview || !shouldShowPreview) return;
    if (typeof window === 'undefined') return;

    const node = intersectionRef.current;
    if (!node) return;
    let isMounted = true;
    const hydratePreview = () => {
      if (!isMounted) return;
      warmedPreviews.add(previewKey);
      slotHeldRef.current = true;
      setCanHydratePreview(true);
      registerLivePreview({
        previewKey,
        getTop: () => intersectionRef.current?.getBoundingClientRect().top,
        retire: () => {
          if (!componentMountedRef.current) return;
          retiredPreviews.add(previewKey);
          autoWarmPreviews.delete(previewKey);
          setCanHydratePreview(false);
        },
      });
      slotReleaseTimerRef.current = window.setTimeout(() => {
        releaseSlotIfHeld();
      }, HYDRATION_SLOT_FALLBACK_RELEASE_MS);
    };

    // Eagerly warm the first visible wave of previews so startup feels instant.
    // Remaining previews are still intersection-gated to keep network pressure controlled.
    // A previously retired preview always takes the intersection path.
    if (!retiredPreviews.has(previewKey) && reserveAutoWarmPreview(previewKey)) {
      requestHydrationSlot(previewKey, hydratePreview);
      return () => {
        isMounted = false;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;

        const distanceFromViewportTop = Math.abs(entry.boundingClientRect.top);
        const priority = Math.max(0, 100000 - distanceFromViewportTop);
        retiredPreviews.delete(previewKey);
        requestHydrationSlot(previewKey, hydratePreview, priority);
        observer.disconnect();
      },
      {
        root: getNearestScrollParent(node),
        // Warm previews well before they enter viewport so scrolling doesn't show blanks.
        rootMargin: '1600px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(node);
    return () => {
      isMounted = false;
      observer.disconnect();
    };
  }, [previewKey, shouldShowPreview, canHydratePreview]);

  useEffect(() => {
    return () => {
      componentMountedRef.current = false;
      releaseSlotIfHeld();
      unregisterLivePreview(previewKey);
    };
  }, [previewKey]);

  const compositionsKey = compositions?.map((c) => c.identifier).join(',');
  const selectedPreview = useMemo(() => {
    if (!shouldShowPreview || !component) return undefined;
    return selectDefaultComposition(component);
  }, [compositionsKey, shouldShowPreview]);

  if (!component || !componentDescriptor) return null;

  if (!shouldShowPreview || !compositions || !compositions.length) {
    return (
      <Container className={styles.noPreview} component={component}>
        <div className={styles.scope}>
          <H5 className={styles.scopeTitle}>{component.id.scope}</H5>
        </div>
        <div className={styles.component}>
          <H3 className={styles.componentTitle}>{displayName}</H3>
          <span className={styles.description}>{description}</span>
        </div>
      </Container>
    );
  }

  const name = component.id.toString();

  if (
    !canHydratePreview ||
    !serverUrl ||
    isServerCompiling ||
    (!shouldShowPreview && component.buildStatus === 'pending')
  )
    return (
      <div ref={intersectionRef} className={styles.previewPlaceholder} data-tip="" data-for={name}>
        <div className={styles.placeholderShimmer}>
          <div className={styles.placeholderChrome}>
            <div className={styles.placeholderDot} />
            <div className={styles.placeholderDot} />
            <div className={styles.placeholderDot} />
          </div>
          <div className={styles.placeholderCanvas}>
            <div className={styles.placeholderBar} style={{ width: '60%' }} />
            <div className={styles.placeholderBar} style={{ width: '40%' }} />
            <div className={styles.placeholderBar} style={{ width: '80%' }} />
          </div>
        </div>
      </div>
    );

  return (
    <div ref={intersectionRef}>
      <ComponentComposition
        component={component}
        composition={selectedPreview}
        pubsub={false}
        includeEnv={true}
        loading={'lazy'}
        viewport={1280}
        queryParams={['disableCta=true', 'onlyOverview=true']}
        onLoad={() => {
          releaseSlotIfHeld();
        }}
      />
      <div className={styles.previewOverlay} />
    </div>
  );
}

const PREVIEW_COMPOSITION_SUFFIX = 'Preview';

function selectDefaultComposition(component: ComponentModel) {
  const { compositions } = component;
  return compositions.find((x) => x.identifier.endsWith(PREVIEW_COMPOSITION_SUFFIX));
}
