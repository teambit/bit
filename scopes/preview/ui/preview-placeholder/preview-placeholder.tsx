import type { ComponentType, ReactNode } from 'react';
import React, { useMemo, useEffect, useRef, useState } from 'react';
import { CompositionsAspect, ComponentComposition, Composition } from '@teambit/compositions';
import { H3, H5 } from '@teambit/design.ui.heading';
import { capitalize } from '@teambit/toolbox.string.capitalize';
import type { ComponentModel } from '@teambit/component';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import { DocsAspect } from '@teambit/docs';
import styles from './preview-placeholder.module.scss';

// ── BrowserSkeleton ─────────────────────────────────────────────────────────

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

// ── Prefetch helper ─────────────────────────────────────────────────────────

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

// ── ViewportGate ────────────────────────────────────────────────────────────
// Defers iframe mounting until near the viewport. Prefetches assets ahead.
// Does NOT own skeleton state — parent handles that via onLoad.

function ViewportGate({
  previewAssetsUrl,
  rootMargin = '0px 0px 200% 0px',
  children,
}: {
  previewAssetsUrl?: string;
  rootMargin?: string;
  children: ReactNode;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    // Prefetch observer — warm browser cache 4 viewports ahead
    const prefetchObs = previewAssetsUrl
      ? new IntersectionObserver(
          ([e]) => {
            if (e.isIntersecting) {
              prefetchPreviewAssets(previewAssetsUrl);
              prefetchObs!.disconnect();
            }
          },
          { rootMargin: '0px 0px 400% 0px' }
        )
      : null;

    // Mount observer — mount iframe when 2 viewports away
    const mountObs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          mountObs.disconnect();
          prefetchObs?.disconnect();
          if (previewAssetsUrl) prefetchPreviewAssets(previewAssetsUrl);
          setVisible(true);
        }
      },
      { rootMargin }
    );

    prefetchObs?.observe(el);
    mountObs.observe(el);

    return () => {
      prefetchObs?.disconnect();
      mountObs.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={sentinelRef} className={styles.viewportGate}>
      {visible ? children : null}
    </div>
  );
}

// ── PreviewPlaceholder ──────────────────────────────────────────────────────

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
  const [previewLoaded, setPreviewLoaded] = useState(false);

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
    <div key={`${name}-${serverUrl}-${forceRender}`} className={styles.previewCard}>
      <ViewportGate previewAssetsUrl={`/api/${name}/~aspect/preview-assets`}>
        <ComponentComposition
          component={component}
          composition={selectedPreview}
          pubsub={false}
          includeEnv={true}
          loading={'lazy'}
          viewport={1280}
          queryParams={'disableCta=true'}
          onLoad={() => setPreviewLoaded(true)}
        />
      </ViewportGate>
      {!previewLoaded && (
        <div className={styles.skeletonOverlay}>
          <BrowserSkeleton />
        </div>
      )}
      <div className={styles.previewOverlay} />
    </div>
  );
}

const PREVIEW_COMPOSITION_SUFFIX = 'Preview';

function selectDefaultComposition(component: ComponentModel) {
  const { compositions } = component;
  return compositions.find((x) => x.identifier.endsWith(PREVIEW_COMPOSITION_SUFFIX));
}
