import type { ComponentType, ReactNode } from 'react';
import React, { useMemo, useEffect, useRef, useState } from 'react';
import { CompositionsAspect, ComponentComposition, Composition } from '@teambit/compositions';
import { H3, H5 } from '@teambit/design.ui.heading';
import { capitalize } from '@teambit/toolbox.string.capitalize';
import type { ComponentModel } from '@teambit/component';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import { DocsAspect } from '@teambit/docs';
import styles from './preview-placeholder.module.scss';

function BrowserSkeleton() {
  return (
    <div className={styles.browserSkeleton}>
      <div className={styles.browserToolbar}>
        <span className={styles.browserDot} />
        <span className={styles.browserDot} />
        <span className={styles.browserDot} />
        <div className={styles.browserUrlBar} />
      </div>
      <div className={styles.browserBody}>
        <div className={styles.browserLine1} />
        <div className={styles.browserLine2} />
        <div className={styles.browserLine3} />
        <div className={styles.browserLine4} />
      </div>
    </div>
  );
}

const SLOT_TIMEOUT = 10_000;

type QueueEntry = {
  id: string;
  resolve: () => void;
  timer?: ReturnType<typeof setTimeout>;
};

class IframeLoadQueue {
  private active = new Map<string, QueueEntry>();
  private pending: QueueEntry[] = [];

  constructor(private maxConcurrent = 6) {}

  enqueue(id: string): Promise<void> {
    if (this.active.has(id)) return Promise.resolve();
    const existing = this.pending.find((e) => e.id === id);
    if (existing)
      return new Promise((resolve) => {
        existing.resolve = resolve;
      });

    if (this.active.size < this.maxConcurrent) {
      const entry: QueueEntry = { id, resolve: () => {} };
      this.active.set(id, entry);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.pending.push({ id, resolve });
    });
  }

  complete(id: string): void {
    const entry = this.active.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    this.active.delete(id);
    this.dequeueNext();
  }

  cancel(id: string): void {
    const entry = this.active.get(id);
    if (entry) {
      if (entry.timer) clearTimeout(entry.timer);
      this.active.delete(id);
      this.dequeueNext();
      return;
    }
    const idx = this.pending.findIndex((e) => e.id === id);
    if (idx !== -1) this.pending.splice(idx, 1);
  }

  private dequeueNext(): void {
    if (this.pending.length === 0 || this.active.size >= this.maxConcurrent) return;
    const next = this.pending.shift()!;
    next.timer = setTimeout(() => this.complete(next.id), SLOT_TIMEOUT);
    this.active.set(next.id, next);
    next.resolve();
  }
}

const iframeLoadQueue = new IframeLoadQueue(6);

const prefetchedAssets = new Set<string>();

function prefetchPreviewAssets(url: string) {
  if (prefetchedAssets.has(url)) return;
  prefetchedAssets.add(url);

  fetch(url)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data?.files) return;
      for (const file of data.files) {
        if (document.querySelector(`link[href*="${file}"]`)) continue;
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = file;
        document.head.appendChild(link);
      }
    })
    .catch(() => {});
}

function ViewportGate({
  componentId,
  previewAssetsUrl,
  skeleton,
  rootMargin = '0px 0px 200% 0px',
  children,
}: {
  componentId?: string;
  previewAssetsUrl?: string;
  skeleton?: ReactNode;
  rootMargin?: string;
  children: ReactNode;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isSlotReady, setIsSlotReady] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const idRef = useRef(componentId || `vg-${Math.random().toString(36).slice(2)}`);

  // Main observer: triggers iframe mount when sentinel enters 2-viewport range
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || hasBeenVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasBeenVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasBeenVisible, rootMargin]);

  // Prefetch observer: fetches asset list when 4 viewports away
  useEffect(() => {
    if (!previewAssetsUrl) return;
    const el = sentinelRef.current;
    if (!el) return;

    const prefetchObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          prefetchPreviewAssets(previewAssetsUrl);
          prefetchObserver.disconnect();
        }
      },
      { rootMargin: '0px 0px 400% 0px' }
    );

    prefetchObserver.observe(el);
    return () => prefetchObserver.disconnect();
  }, [previewAssetsUrl]);

  // Request a loading slot from the queue once visible
  useEffect(() => {
    if (!hasBeenVisible || isSlotReady) return;

    let cancelled = false;
    const id = idRef.current;

    // eslint-disable-next-line promise/catch-or-return
    iframeLoadQueue.enqueue(id).then(() => {
      if (!cancelled) setIsSlotReady(true);
    });

    return () => {
      cancelled = true;
      iframeLoadQueue.cancel(id);
    };
  }, [hasBeenVisible, isSlotReady]);

  // Listen for iframe content ready — skeleton stays until iframe actually renders
  useEffect(() => {
    if (!isSlotReady || iframeReady) return;

    const id = idRef.current;
    const handleMessage = (event: MessageEvent) => {
      const evt = event.data?.event;
      // _DOM_LOADED_ = iframe HTML loaded, preview-size = content measured
      if (evt === '_DOM_LOADED_' || evt === 'preview-size') {
        setIframeReady(true);
        iframeLoadQueue.complete(id);
      }
    };

    window.addEventListener('message', handleMessage);
    // Safety timeout — don't block forever if iframe never reports
    const timer = setTimeout(() => {
      setIframeReady(true);
      iframeLoadQueue.complete(id);
    }, 15_000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timer);
    };
  }, [isSlotReady, iframeReady]);

  const mountIframe = hasBeenVisible && isSlotReady;
  const showSkeleton = !iframeReady;

  return (
    <div ref={sentinelRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {mountIframe && children}
      {showSkeleton && <div className={styles.skeletonOverlay}>{skeleton}</div>}
    </div>
  );
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

  const prevServerUrlRef = useRef(serverUrl);
  const [forceRender, setForceRender] = React.useState(0);

  useEffect(() => {
    if (prevServerUrlRef.current !== serverUrl && shouldShowPreview) {
      prevServerUrlRef.current = serverUrl;
      setForceRender((prev) => prev + 1);
    }
  }, [serverUrl, shouldShowPreview]);

  const selectedPreview = useMemo(() => {
    if (!shouldShowPreview || !component) return undefined;
    return selectDefaultComposition(component);
  }, [component, shouldShowPreview, forceRender]);

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

  if (!serverUrl || (!shouldShowPreview && component.buildStatus === 'pending'))
    return (
      <div className={styles.previewPlaceholder} data-tip="" data-for={name}>
        <BrowserSkeleton />
      </div>
    );

  return (
    <div key={`${name}-${serverUrl}-${forceRender}`}>
      <ViewportGate
        componentId={name}
        previewAssetsUrl={`/api/${name}/~aspect/preview-assets`}
        skeleton={<BrowserSkeleton />}
      >
        <ComponentComposition
          component={component}
          composition={selectedPreview}
          pubsub={false}
          includeEnv={true}
          loading={'lazy'}
          viewport={1280}
          queryParams={'disableCta=true'}
        />
      </ViewportGate>
      <div className={styles.previewOverlay} />
    </div>
  );
}

const PREVIEW_COMPOSITION_SUFFIX = 'Preview';

function selectDefaultComposition(component: ComponentModel) {
  const { compositions } = component;
  return compositions.find((x) => x.identifier.endsWith(PREVIEW_COMPOSITION_SUFFIX));
}
