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
const HYDRATION_CONCURRENCY = 16;
const HYDRATION_SLOT_FALLBACK_RELEASE_MS = 1800;
const AUTO_WARM_PREVIEW_LIMIT = 96;
const hydrationQueue: Array<{ previewKey: string; run: () => void }> = [];
const queuedPreviewKeys = new Set<string>();
let activeHydrationSlots = 0;

function processHydrationQueue() {
  while (activeHydrationSlots < HYDRATION_CONCURRENCY && hydrationQueue.length > 0) {
    const next = hydrationQueue.shift();
    if (!next) break;
    queuedPreviewKeys.delete(next.previewKey);
    activeHydrationSlots += 1;
    next.run();
  }
}

function requestHydrationSlot(previewKey: string, run: () => void) {
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
  hydrationQueue.push({ previewKey, run });
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
  const previewKey = component?.id?.toString?.() || componentDescriptor?.id?.toString?.() || '';
  const intersectionRef = useRef<HTMLDivElement>(null);
  const [canHydratePreview, setCanHydratePreview] = useState(() => !!previewKey && warmedPreviews.has(previewKey));
  const slotHeldRef = useRef(false);
  const slotReleaseTimerRef = useRef<number | undefined>(undefined);

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
      slotReleaseTimerRef.current = window.setTimeout(() => {
        releaseSlotIfHeld();
      }, HYDRATION_SLOT_FALLBACK_RELEASE_MS);
    };

    // Eagerly warm the first visible wave of previews so startup feels instant.
    // Remaining previews are still intersection-gated to keep network pressure controlled.
    if (reserveAutoWarmPreview(previewKey)) {
      requestHydrationSlot(previewKey, hydratePreview);
      return () => {
        isMounted = false;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;

        requestHydrationSlot(previewKey, hydratePreview);
        observer.disconnect();
      },
      {
        root: getNearestScrollParent(node),
        // Warm previews well before they enter viewport so scrolling doesn't show blanks.
        rootMargin: '3200px 0px',
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
      releaseSlotIfHeld();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compositionsKey = compositions?.map((c) => c.identifier).join(',');
  const selectedPreview = useMemo(() => {
    if (!shouldShowPreview || !component) return undefined;
    return selectDefaultComposition(component);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (!canHydratePreview || !serverUrl || (!shouldShowPreview && component.buildStatus === 'pending'))
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
