import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import {
  CompositionContent,
  LiveControlsDiffPanel,
  useDefaultControlsSchemaResponder,
  type CompositionContentProps,
  type EmptyStateSlot,
} from '@teambit/compositions';
import { CompositionContextProvider } from '@teambit/compositions.ui.hooks.use-composition';
import { useCompareQueryParam } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { CompareSplitLayoutPreset } from '@teambit/component.ui.component-compare.layouts.compare-split-layout-preset';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { Icon } from '@teambit/evangelist.elements.icon';
import { useLocation } from '@teambit/base-react.navigation.link';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import queryString from 'query-string';
import { CompositionDropdown } from './composition-dropdown';
import { CompositionCompareContext } from './composition-compare.context';
import { uniqBy } from 'lodash';
import * as semver from 'semver';

import styles from './composition-compare.module.scss';

const noop = () => {};
const LOCAL_VERSION = 'workspace';

export type CompositionCompareProps = {
  emptyState?: EmptyStateSlot;
  Widgets?: {
    Right?: React.ReactNode;
    Left?: React.ReactNode;
  };
  previewViewProps?: CompositionContentProps;
  PreviewView?: React.ComponentType<CompositionContentProps>;
};

type ControlsStatus = 'loading' | 'available' | 'empty';

function MissingCompositionTemplate({ message, title }: { message?: string; title?: string } = {}) {
  return (
    <div className={styles.subView}>
      <div className={styles.missingComposition}>
        <div className={styles.missingCompositionTitle}>{title || 'Composition not available'}</div>
        {message && <div className={styles.missingCompositionSubtitle}>{message}</div>}
      </div>
    </div>
  );
}

function MissingComposition({ compositionId, version }: { compositionId?: string; version: string }) {
  const message = compositionId
    ? `The selected composition "${compositionId}" does not exist for the ${version} version.`
    : `The selected composition does not exist for the ${version} version.`;
  return <MissingCompositionTemplate message={message} />;
}

function getCompositionTag(hasInBase: boolean, hasInCompare: boolean): string | undefined {
  if (hasInBase && hasInCompare) return undefined;
  if (hasInBase) return 'Base only';
  if (hasInCompare) return 'Compare only';
  return undefined;
}

function useResizePanel(initialHeight: number) {
  const MIN_PANEL_HEIGHT = 80;
  const MIN_COMPARE_HEIGHT = 150;
  const DEFAULT_PANEL_RATIO = 0.34;
  const [panelHeight, setPanelHeight] = useState(initialHeight);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const panelHeightRef = useRef(initialHeight);
  const removeListenersRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const userResizedRef = useRef(false);

  const getMaxPanelHeight = useCallback(() => {
    const containerHeight = panelRef.current?.parentElement?.clientHeight;
    if (!containerHeight) return Math.max(MIN_PANEL_HEIGHT, initialHeight);
    return Math.max(MIN_PANEL_HEIGHT, containerHeight - MIN_COMPARE_HEIGHT);
  }, [MIN_COMPARE_HEIGHT, MIN_PANEL_HEIGHT, initialHeight]);

  const getDefaultPanelHeight = useCallback(() => {
    const containerHeight = panelRef.current?.parentElement?.clientHeight;
    if (!containerHeight || containerHeight <= 0) return initialHeight;
    return Math.max(initialHeight, Math.round(containerHeight * DEFAULT_PANEL_RATIO));
  }, [initialHeight, DEFAULT_PANEL_RATIO]);

  const clampPanelHeight = useCallback(
    (height: number) => {
      const maxHeight = getMaxPanelHeight();
      return Math.max(MIN_PANEL_HEIGHT, Math.min(maxHeight, height));
    },
    [MIN_PANEL_HEIGHT, getMaxPanelHeight]
  );

  const applyPanelHeight = useCallback(
    (height: number, commitToState = false) => {
      const clamped = clampPanelHeight(height);
      panelHeightRef.current = clamped;
      if (panelRef.current) panelRef.current.style.height = `${clamped}px`;
      if (commitToState) setPanelHeight(clamped);
      return clamped;
    },
    [clampPanelHeight]
  );

  const syncPanelHeight = useCallback(() => {
    if (isDragging.current) return;
    const nextHeight = userResizedRef.current ? panelHeightRef.current : getDefaultPanelHeight();
    applyPanelHeight(nextHeight, true);
  }, [applyPanelHeight, getDefaultPanelHeight]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    syncPanelHeight();
  }, [syncPanelHeight]);

  useEffect(() => {
    const handleWindowResize = () => {
      syncPanelHeight();
    };

    handleWindowResize();
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [syncPanelHeight]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const parent = panelRef.current?.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver(() => {
      syncPanelHeight();
    });
    observer.observe(parent);

    return () => observer.disconnect();
  }, [syncPanelHeight]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging.current = true;
      setIsResizing(true);

      const startY = e.clientY;
      const startHeight = panelHeightRef.current;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;
        moveEvent.preventDefault();
        const delta = startY - moveEvent.clientY;
        const targetHeight = startHeight + delta;
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          applyPanelHeight(targetHeight);
          rafRef.current = null;
        });
      };

      const handleMouseUp = () => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        userResizedRef.current = true;
        isDragging.current = false;
        applyPanelHeight(panelHeightRef.current, true);
        setIsResizing(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('blur', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      removeListenersRef.current?.();
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('blur', handleMouseUp);
      removeListenersRef.current = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('blur', handleMouseUp);
      };
    },
    [applyPanelHeight]
  );

  useEffect(() => {
    return () => {
      isDragging.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      removeListenersRef.current?.();
      removeListenersRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  return { panelRef, panelHeight, isResizing, handleResizeStart };
}

function findComposition(compositions: any[] | undefined, id: string | undefined) {
  if (!id || !compositions) return compositions?.[0];
  return compositions.find((c) => c.identifier === id) || undefined;
}

function useCompositionSelection() {
  const selectedCompositionBaseFile = useCompareQueryParam('compositionBaseFile');
  const selectedCompositionCompareFile = useCompareQueryParam('compositionCompareFile');
  return { selectedCompositionBaseFile, selectedCompositionCompareFile };
}

function buildChannelKey(prefix: string, idStr: string | undefined, compId: string | undefined): string | undefined {
  if (!idStr || !compId) return undefined;
  return `${prefix}:${idStr}:${compId}`;
}

function buildQueryParams(channelKey: string | undefined) {
  const params = { livecontrols: true, ...(channelKey ? { lcchannel: channelKey } : {}) };
  return { params, queryString: queryString.stringify(params) };
}

function buildUpdatedUrlFromQuery(
  query: URLSearchParams,
  pathname: string,
  queryParams: {
    compositionBaseFile?: string;
    compositionCompareFile?: string;
  }
) {
  const queryObj = Object.fromEntries(query.entries());
  const updatedObj = { ...queryObj, ...queryParams };
  const updatedQueryString = new URLSearchParams(updatedObj).toString();
  return `${pathname}?${updatedQueryString}`;
}

function resolveVersion(model: any): string | undefined {
  const id = model?.id;
  const versionFromField = id?.version?.toString?.();
  const versionFromToString = typeof id?.toString === 'function' ? id.toString().split('@')[1] : undefined;
  return versionFromField || versionFromToString;
}

function hasStableCompareData(contextLoading: boolean | undefined, base: any, compare: any) {
  return !contextLoading && base !== undefined && compare !== undefined;
}

function resolveRequestedCompositionId({
  selectedCompositionCompareFile,
  selectedCompositionBaseFile,
  compareStateId,
  baseStateId,
  compareCompositions,
  baseCompositions,
}: {
  selectedCompositionCompareFile?: string;
  selectedCompositionBaseFile?: string;
  compareStateId?: string;
  baseStateId?: string;
  compareCompositions?: any[];
  baseCompositions?: any[];
}) {
  const explicitId = selectedCompositionCompareFile || selectedCompositionBaseFile;
  const stateId = compareStateId || baseStateId;
  const defaultId = compareCompositions?.[0]?.identifier || baseCompositions?.[0]?.identifier;
  return explicitId || stateId || defaultId;
}

function resolveCompositionId(selectedComposition: any, requestedCompositionId?: string) {
  return selectedComposition?.identifier || requestedCompositionId;
}

function hasMissingComposition(requestedCompositionId: string | undefined, selectedComposition: any) {
  return Boolean(!requestedCompositionId || !selectedComposition);
}

function buildControlsResetKey(baseChannelKey: string | undefined, compareChannelKey: string | undefined) {
  return `${baseChannelKey || ''}-${compareChannelKey || ''}`;
}

function formatVersionForLabel(version: string | undefined, opts?: { forceWorkspace?: boolean }) {
  if (opts?.forceWorkspace) return LOCAL_VERSION;
  if (!version) return undefined;
  if (version === LOCAL_VERSION) return LOCAL_VERSION;
  return semver.valid(version) ? version : version.slice(0, 6);
}

function useStableControlLabels(baseModel: any, compareModel: any, compareHasLocalChanges?: boolean) {
  const baseVersion = useMemo(() => formatVersionForLabel(resolveVersion(baseModel)), [baseModel]);
  const compareVersion = useMemo(
    () => formatVersionForLabel(resolveVersion(compareModel), { forceWorkspace: compareHasLocalChanges }),
    [compareModel, compareHasLocalChanges]
  );
  const [stableVersions, setStableVersions] = useState<{
    base?: string;
    compare?: string;
  }>({
    base: baseVersion,
    compare: compareVersion,
  });

  useEffect(() => {
    setStableVersions((prev) => {
      const nextBase = baseVersion ?? prev.base;
      const nextCompare = compareVersion ?? prev.compare;
      if (nextBase === prev.base && nextCompare === prev.compare) return prev;
      return { base: nextBase, compare: nextCompare };
    });
  }, [baseVersion, compareVersion]);

  const effectiveBaseVersion = baseVersion ?? stableVersions.base;
  const effectiveCompareVersion = compareVersion ?? stableVersions.compare;

  return useMemo(
    () => ({
      common: 'Common',
      base: effectiveBaseVersion ? `Base version: ${effectiveBaseVersion}` : 'Base version',
      compare: effectiveCompareVersion ? `Compare version: ${effectiveCompareVersion}` : 'Compare version',
    }),
    [effectiveBaseVersion, effectiveCompareVersion]
  );
}

type CompositionLayoutProps = {
  model: any;
  selected: any;
  queryParams: string;
  compositionParams: Record<string, any>;
  previewViewProps: CompositionContentProps;
  emptyState?: EmptyStateSlot;
  PreviewView: React.ComponentType<CompositionContentProps>;
  contextKey: string;
  isBase?: boolean;
  isCompare?: boolean;
};

function CompositionLayout({
  model,
  selected,
  queryParams,
  compositionParams,
  previewViewProps,
  emptyState,
  PreviewView,
  contextKey,
  isBase,
  isCompare,
}: CompositionLayoutProps) {
  return (
    <div className={styles.subView}>
      <CompositionCompareContext.Provider
        value={{
          compositionProps: {
            forceHeight: undefined,
            innerBottomPadding: 50,
            ...previewViewProps,
            emptyState,
            component: model,
            queryParams,
            selected,
          },
          isBase,
          isCompare,
        }}
      >
        <CompositionContextProvider queryParams={compositionParams} setQueryParams={noop}>
          <PreviewView
            key={contextKey}
            forceHeight={undefined}
            innerBottomPadding={50}
            {...previewViewProps}
            emptyState={emptyState}
            component={model}
            selected={selected}
            queryParams={queryParams}
          />
        </CompositionContextProvider>
      </CompositionCompareContext.Provider>
    </div>
  );
}

export function CompositionCompare(props: CompositionCompareProps) {
  const {
    emptyState,
    PreviewView = CompositionContent,
    Widgets,
    previewViewProps = {} as CompositionContentProps,
  } = props;

  const componentCompareContext = useComponentCompare();
  const query = useQuery();
  const location = useLocation() || { pathname: '/' };
  const { base, compare, baseContext, compareContext, loading: contextLoading } = componentCompareContext || {};

  const [isControlsOpen, setControlsOpen] = useState(true);
  const [controlsStatus, setControlsStatus] = useState<ControlsStatus>('loading');
  const [everHadControls, setEverHadControls] = useState(false);
  const { panelRef, panelHeight, isResizing, handleResizeStart } = useResizePanel(240);

  const isStableData = hasStableCompareData(contextLoading, base, compare);
  const baseCompositions = base?.model.compositions;
  const compareCompositions = compare?.model.compositions;

  const { selectedCompositionBaseFile, selectedCompositionCompareFile } = useCompositionSelection();

  const compareState = compareContext?.state?.preview;
  const baseHooks = baseContext?.hooks?.preview;
  const compareHooks = compareContext?.hooks?.preview;

  const requestedCompositionId = useMemo(
    () =>
      resolveRequestedCompositionId({
        selectedCompositionCompareFile,
        selectedCompositionBaseFile,
        compareStateId: compareState?.id,
        baseStateId: baseContext?.state?.preview?.id,
        compareCompositions,
        baseCompositions,
      }),
    [
      selectedCompositionCompareFile,
      selectedCompositionBaseFile,
      compareState?.id,
      baseContext?.state?.preview?.id,
      compareCompositions,
      baseCompositions,
    ]
  );

  const selectedBaseComp = findComposition(baseCompositions, requestedCompositionId);
  const selectedCompareComp = findComposition(compareCompositions, requestedCompositionId);

  const baseMissingSelectedCompoisition = hasMissingComposition(requestedCompositionId, selectedBaseComp);
  const compareMissingSelectedComposition = hasMissingComposition(requestedCompositionId, selectedCompareComp);

  const baseCompositionIds = useMemo(
    () => new Set((baseCompositions || []).map((c) => c.identifier)),
    [baseCompositions]
  );
  const compareCompositionIds = useMemo(
    () => new Set((compareCompositions || []).map((c) => c.identifier)),
    [compareCompositions]
  );

  const compositionsDropdownSource = useMemo(() => {
    return uniqBy((baseCompositions || []).concat(compareCompositions || []), 'identifier')?.map((c) => {
      const hasInBase = baseCompositionIds.has(c.identifier);
      const hasInCompare = compareCompositionIds.has(c.identifier);
      const tag = getCompositionTag(hasInBase, hasInCompare);
      const href = !compareState?.controlled
        ? buildUpdatedUrlFromQuery(query, location.pathname, {
            compositionBaseFile: c.identifier,
            compositionCompareFile: c.identifier,
          })
        : buildUpdatedUrlFromQuery(query, location.pathname, {});
      const onClick = compareState?.controlled
        ? (id, e) => {
            compareHooks?.onClick?.(id, e);
            baseHooks?.onClick?.(id, e);
          }
        : undefined;
      return { id: c.identifier, label: c.displayName, href, onClick, tag };
    });
  }, [
    baseCompositions,
    compareCompositions,
    baseCompositionIds,
    compareCompositionIds,
    compareState?.controlled,
    compareHooks,
    baseHooks,
    query,
    location.pathname,
  ]);

  const selectedCompareDropdown = useMemo(() => {
    const found =
      compositionsDropdownSource.find((item) => item.id === selectedCompareComp?.identifier) ||
      compositionsDropdownSource.find((item) => item.id === selectedBaseComp?.identifier);
    if (found) return found;
    if (requestedCompositionId) return { id: requestedCompositionId, label: requestedCompositionId, tag: 'Missing' };
    return undefined;
  }, [
    compositionsDropdownSource,
    selectedCompareComp?.identifier,
    selectedBaseComp?.identifier,
    requestedCompositionId,
  ]);

  const baseIdStr = base?.model.id?.toString();
  const compareIdStr = compare?.model.id?.toString();
  useDefaultControlsSchemaResponder(baseIdStr, Boolean(baseIdStr));
  useDefaultControlsSchemaResponder(compareIdStr, Boolean(compareIdStr));

  const baseCompId = resolveCompositionId(selectedBaseComp, requestedCompositionId);
  const compareCompId = resolveCompositionId(selectedCompareComp, requestedCompositionId);

  const baseChannelKey = useMemo(() => buildChannelKey('base', baseIdStr, baseCompId), [baseIdStr, baseCompId]);
  const compareChannelKey = useMemo(
    () => buildChannelKey('compare', compareIdStr, compareCompId),
    [compareIdStr, compareCompId]
  );

  const baseQuery = useMemo(() => buildQueryParams(baseChannelKey), [baseChannelKey]);
  const compareQuery = useMemo(() => buildQueryParams(compareChannelKey), [compareChannelKey]);

  const controlsResetKey = buildControlsResetKey(baseChannelKey, compareChannelKey);
  const hasControlChannels = Boolean(baseChannelKey && compareChannelKey);

  useEffect(() => {
    setEverHadControls(false);
    setControlsStatus('loading');
  }, [controlsResetKey]);

  const handleControlsStatusChange = useCallback((status: ControlsStatus) => {
    setControlsStatus(status);
    if (status === 'available') setEverHadControls(true);
  }, []);

  const showControlsPanel = controlsStatus === 'available' || everHadControls;

  const baseModel = base?.model;
  const compareModel = compare?.model;
  const stableLabels = useStableControlLabels(baseModel, compareModel, compare?.hasLocalChanges);

  const BaseLayout = useMemo(() => {
    if (!isStableData || !baseModel) return null;
    if (baseMissingSelectedCompoisition)
      return <MissingComposition compositionId={requestedCompositionId} version="base" />;
    return (
      <CompositionLayout
        model={baseModel}
        selected={selectedBaseComp}
        queryParams={baseQuery.queryString}
        compositionParams={baseQuery.params}
        previewViewProps={previewViewProps}
        emptyState={emptyState}
        PreviewView={PreviewView}
        contextKey={`base-${baseIdStr}-${baseCompId}`}
        isBase
      />
    );
  }, [
    isStableData,
    baseModel,
    baseIdStr,
    baseCompId,
    baseChannelKey,
    selectedBaseComp?.identifier,
    baseQuery,
    previewViewProps,
    emptyState,
    baseMissingSelectedCompoisition,
    requestedCompositionId,
  ]);

  const CompareLayout = useMemo(() => {
    if (!isStableData) return null;
    if (compareMissingSelectedComposition)
      return <MissingComposition compositionId={requestedCompositionId} version="compare" />;
    return (
      <CompositionLayout
        model={compareModel}
        selected={selectedCompareComp}
        queryParams={compareQuery.queryString}
        compositionParams={compareQuery.params}
        previewViewProps={previewViewProps}
        emptyState={emptyState}
        PreviewView={PreviewView}
        contextKey={`compare-${compareIdStr}-${compareCompId}`}
        isCompare
      />
    );
  }, [
    isStableData,
    compareModel,
    compareIdStr,
    compareCompId,
    compareChannelKey,
    selectedCompareComp?.identifier,
    compareQuery,
    previewViewProps,
    emptyState,
    compareMissingSelectedComposition,
    requestedCompositionId,
  ]);

  const toggleControls = useCallback(() => setControlsOpen((x) => !x), []);
  const handleHeaderKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') toggleControls();
    },
    [toggleControls]
  );

  const key = `${base?.model.id.toString()}-${compare?.model.id.toString()}-composition-compare`;

  if (!contextLoading && !baseCompositions?.length && !compareCompositions?.length) {
    return <MissingCompositionTemplate title={`No Compositions Available`} />;
  }

  return (
    <div key={key} className={classNames(styles.container, { [styles.isResizing]: isResizing })}>
      {contextLoading && (
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      )}
      <div className={styles.toolbar}>
        <div className={styles.left}>
          <div className={styles.dropdown}>
            {compositionsDropdownSource.length > 0 && (
              <CompositionDropdown dropdownItems={compositionsDropdownSource} selected={selectedCompareDropdown} />
            )}
          </div>
          <div className={styles.widgets}>{Widgets?.Left}</div>
        </div>
        <div className={styles.right}>
          <div className={styles.widgets}>{Widgets?.Right}</div>
        </div>
      </div>
      <div className={styles.compareLayout}>
        <div className={styles.compareMain}>
          <CompareSplitLayoutPreset base={BaseLayout} compare={CompareLayout} />
        </div>
        {hasControlChannels && (
          <div
            ref={panelRef}
            className={styles.controlsPanel}
            style={showControlsPanel ? (isControlsOpen ? { height: panelHeight } : undefined) : { display: 'none' }}
          >
            <div
              className={styles.controlsResizeHandle}
              onMouseDown={handleResizeStart}
              role="separator"
              aria-orientation="horizontal"
            />
            <div
              className={styles.controlsPanelHeader}
              onClick={toggleControls}
              onKeyDown={handleHeaderKeyDown}
              role="button"
              tabIndex={0}
            >
              <Icon of={isControlsOpen ? 'fat-arrow-down' : 'fat-arrow-up'} className={styles.controlsArrow} />
              <span className={styles.controlsPanelTitle}>Live controls</span>
            </div>
            <div className={styles.controlsPanelContent} style={{ display: isControlsOpen ? undefined : 'none' }}>
              <LiveControlsDiffPanel
                resetKey={controlsResetKey}
                baseChannel={baseChannelKey}
                compareChannel={compareChannelKey}
                commonLabel={stableLabels.common}
                baseLabel={stableLabels.base}
                compareLabel={stableLabels.compare}
                showEmptyState={false}
                onStatusChange={handleControlsStatusChange}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
