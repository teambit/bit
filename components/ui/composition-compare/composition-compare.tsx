import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import {
  CompositionContent,
  LiveControlsDiffPanel,
  type CompositionContentProps,
  type EmptyStateSlot,
} from '@teambit/compositions';
import { CompositionContextProvider } from '@teambit/compositions.ui.hooks.use-composition';
import {
  useCompareQueryParam,
  useUpdatedUrlFromQuery,
} from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { CompareSplitLayoutPreset } from '@teambit/component.ui.component-compare.layouts.compare-split-layout-preset';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { Icon } from '@teambit/evangelist.elements.icon';
import queryString from 'query-string';
import { CompositionDropdown } from './composition-dropdown';
import { CompositionCompareContext } from './composition-compare.context';
import { uniqBy } from 'lodash';

import styles from './composition-compare.module.scss';

const noop = () => {};

export type CompositionCompareProps = {
  emptyState?: EmptyStateSlot;
  Widgets?: {
    Right?: React.ReactNode;
    Left?: React.ReactNode;
  };
  previewViewProps?: CompositionContentProps;
  PreviewView?: React.ComponentType<CompositionContentProps>;
};

function MissingComposition({ compositionId, version }: { compositionId?: string; version: string }) {
  const message = compositionId
    ? `The selected composition "${compositionId}" does not exist for the ${version} version.`
    : `The selected composition does not exist for the ${version} version.`;
  return (
    <div className={styles.subView}>
      <div className={styles.missingComposition}>
        <div className={styles.missingCompositionTitle}>Composition not available</div>
        <div className={styles.missingCompositionSubtitle}>{message}</div>
      </div>
    </div>
  );
}

function getCompositionTag(hasInBase: boolean, hasInCompare: boolean): string | undefined {
  if (hasInBase && hasInCompare) return undefined;
  if (hasInBase) return 'Base only';
  if (hasInCompare) return 'Compare only';
  return undefined;
}

function useResizePanel(initialHeight: number) {
  const [panelHeight, setPanelHeight] = useState(initialHeight);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging.current = true;
      setIsResizing(true);

      const startY = e.clientY;
      const startHeight = panelHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;
        moveEvent.preventDefault();
        const delta = startY - moveEvent.clientY;
        const containerHeight = panelRef.current?.parentElement?.clientHeight || 600;
        const maxHeight = Math.max(100, containerHeight - 200);
        setPanelHeight(Math.max(60, Math.min(maxHeight, startHeight + delta)));
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [panelHeight]
  );

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
  const { base, compare, baseContext, compareContext, loading: contextLoading } = componentCompareContext || {};

  const [isControlsOpen, setControlsOpen] = useState(true);
  const [controlsStatus, setControlsStatus] = useState<'loading' | 'available' | 'empty'>('loading');
  const [everHadControls, setEverHadControls] = useState(false);
  const { panelRef, panelHeight, isResizing, handleResizeStart } = useResizePanel(200);

  const isStableData = !contextLoading && base !== undefined && compare !== undefined;
  const baseCompositions = base?.model.compositions;
  const compareCompositions = compare?.model.compositions;

  const { selectedCompositionBaseFile, selectedCompositionCompareFile } = useCompositionSelection();

  const compareState = compareContext?.state?.preview;
  const baseHooks = baseContext?.hooks?.preview;
  const compareHooks = compareContext?.hooks?.preview;

  const explicitId = selectedCompositionCompareFile || selectedCompositionBaseFile;
  const stateId = compareState?.id || baseContext?.state?.preview?.id;
  const defaultId = compareCompositions?.[0]?.identifier || baseCompositions?.[0]?.identifier;
  const requestedCompositionId = explicitId || stateId || defaultId;

  const selectedBaseComp = findComposition(baseCompositions, requestedCompositionId);
  const selectedCompareComp = findComposition(compareCompositions, requestedCompositionId);

  const baseMissing = Boolean(requestedCompositionId && !selectedBaseComp);
  const compareMissing = Boolean(requestedCompositionId && !selectedCompareComp);

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
        ? useUpdatedUrlFromQuery({ compositionBaseFile: c.identifier, compositionCompareFile: c.identifier })
        : useUpdatedUrlFromQuery({});
      const onClick = compareState?.controlled
        ? (id, e) => {
            compareHooks?.onClick?.(id, e);
            baseHooks?.onClick?.(id, e);
          }
        : undefined;
      return { id: c.identifier, label: c.displayName, href, onClick, tag };
    });
  }, [baseCompositions, compareCompositions, baseCompositionIds, compareCompositionIds, compareState?.controlled]);

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
  const baseCompId = selectedBaseComp?.identifier || requestedCompositionId;
  const compareCompId = selectedCompareComp?.identifier || requestedCompositionId;

  const baseChannelKey = useMemo(() => buildChannelKey('base', baseIdStr, baseCompId), [baseIdStr, baseCompId]);
  const compareChannelKey = useMemo(
    () => buildChannelKey('compare', compareIdStr, compareCompId),
    [compareIdStr, compareCompId]
  );

  const baseQuery = useMemo(() => buildQueryParams(baseChannelKey), [baseChannelKey]);
  const compareQuery = useMemo(() => buildQueryParams(compareChannelKey), [compareChannelKey]);

  const controlsResetKey = `${baseChannelKey || ''}-${compareChannelKey || ''}`;

  useEffect(() => {
    setEverHadControls(false);
    setControlsStatus('loading');
  }, [baseIdStr, compareIdStr]);

  const handleControlsStatusChange = useCallback((status: 'loading' | 'available' | 'empty') => {
    setControlsStatus(status);
    if (status === 'available') setEverHadControls(true);
  }, []);

  const showControlsPanel = controlsStatus === 'available' || controlsStatus === 'loading' || everHadControls;

  const baseModel = base?.model;
  const compareModel = compare?.model;

  const BaseLayout = useMemo(() => {
    if (!isStableData || !baseChannelKey || !baseModel) return null;
    if (baseMissing) return <MissingComposition compositionId={requestedCompositionId} version="base" />;
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
    baseMissing,
    requestedCompositionId,
  ]);

  const CompareLayout = useMemo(() => {
    if (!isStableData || !compareChannelKey || !compareModel) return null;
    if (compareMissing) return <MissingComposition compositionId={requestedCompositionId} version="compare" />;
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
    compareMissing,
    requestedCompositionId,
  ]);

  const toggleControls = useCallback(() => setControlsOpen((x) => !x), []);
  const handleHeaderKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') toggleControls();
    },
    [toggleControls]
  );

  if (!base && !compare) return null;

  const key = `${base?.model.id.toString()}-${compare?.model.id.toString()}-composition-compare`;

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
        {showControlsPanel && (
          <div
            ref={panelRef}
            className={styles.controlsPanel}
            style={isControlsOpen ? { height: panelHeight } : undefined}
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
