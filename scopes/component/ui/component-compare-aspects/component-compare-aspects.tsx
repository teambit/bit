import React, { HTMLAttributes, useState, useMemo } from 'react';
import classNames from 'classnames';
import { gql } from '@apollo/client';
import { isEmpty, isEqual } from 'lodash';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { ComponentCompareCodeTree } from '@teambit/component.ui.component-compare-code';
import { CompareStatus, ComponentCompareStatusResolver } from '@teambit/component.ui.component-compare-status-resolver';
import { useComponentCompareContext, useComponentCompareParams } from '@teambit/component.ui.component-compare';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { ComponentCompareAspectView } from './component-compare-aspect-view';

import styles from './component-compare-aspects.module.scss';
import { ComponentCompareAspectsContext, useComponentCompareAspectsContext } from './component-compare-aspects-context';

export type ComponentCompareAspectsProps = { host: string } & HTMLAttributes<HTMLDivElement>;
export type ComponentAspectData = {
  icon?: string;
  name?: string;
  config: any;
  data: any;
  aspectId: string;
};

const GET_COMPONENT_ASPECT_DATA = gql`
  query GetComponentAspectData($id: String!, $extensionId: String!) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      get(id: $id) {
        id {
          name
          version
          scope
        }
        aspects {
          aspectId: id
          config
          data
          icon
        }
      }
    }
  }
`;

export function ComponentCompareAspects({ host, className }: ComponentCompareAspectsProps) {
  const componentCompareContext = useComponentCompareContext();
  const base = componentCompareContext?.base;
  const compare = componentCompareContext?.compare;
  const isCompareVersionWorkspace = componentCompareContext?.isCompareVersionWorkspace;
  const baseId = `${base?.id.fullName}@${base?.id.version}`;
  const compareId = isCompareVersionWorkspace ? compare?.id.fullName : `${compare?.id.fullName}@${compare?.id.version}`;

  const { data: baseAspectData, loading: baseLoading } = useDataQuery(GET_COMPONENT_ASPECT_DATA, {
    variables: { id: baseId, extensionId: host },
    skip: !base?.id,
  });

  const { data: compareAspectData, loading: compareLoading } = useDataQuery(GET_COMPONENT_ASPECT_DATA, {
    variables: { id: compareId, extensionId: host },
    skip: !compare?.id,
  });

  const loading = baseLoading || compareLoading || componentCompareContext?.loading;
  const baseAspectList: ComponentAspectData[] = baseAspectData?.getHost?.get?.aspects || [];
  const compareAspectList: ComponentAspectData[] = compareAspectData?.getHost?.get?.aspects || [];

  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  const params = useComponentCompareParams();

  const selected =
    params?.selectedAspect || (!loading && compareAspectList?.length > 0 && compareAspectList[0].aspectId) || undefined;

  const selectedBaseAspect = useMemo(
    () => baseAspectList?.find((baseAspect) => baseAspect.aspectId === selected),
    [baseAspectList, selected]
  );

  const selectedCompareAspect = useMemo(
    () => compareAspectList?.find((compareAspect) => compareAspect.aspectId === selected),
    [compareAspectList, selected]
  );

  const aspectNames = (baseAspectList || []).concat(compareAspectList || []).map((aspect) => aspect.aspectId);

  return (
    <ComponentCompareAspectsContext.Provider value={{ base: baseAspectList, compare: compareAspectList, loading }}>
      <SplitPane
        layout={sidebarOpenness}
        size="85%"
        className={classNames(styles.componentCompareAspectContainer, className)}
      >
        <Pane className={styles.left}>
          {loading && (
            <div className={styles.loader}>
              <RoundLoader />
            </div>
          )}
          <ComponentCompareAspectView
            name={selected}
            baseAspectData={selectedBaseAspect}
            compareAspectData={selectedCompareAspect}
            loading={loading}
          />
        </Pane>
        <HoverSplitter className={styles.splitter}>
          <Collapser
            placement="left"
            isOpen={isSidebarOpen}
            onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
            onClick={() => setSidebarOpenness((x) => !x)}
            tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} aspects tree`}
            className={styles.collapser}
          />
        </HoverSplitter>
        <Pane className={classNames(styles.right, styles.dark)}>
          <ComponentCompareCodeTree
            fileTree={aspectNames}
            currentFile={selected}
            drawerName={'ASPECTS'}
            queryParam={'selectedAspect'}
            getWidgets={getWidgets}
          />
        </Pane>
      </SplitPane>
    </ComponentCompareAspectsContext.Provider>
  );
}

function getWidgets(fileName: string) {
  const componentCompareAspectsContext = useComponentCompareAspectsContext();

  if (componentCompareAspectsContext?.loading) return null;

  const base = componentCompareAspectsContext?.base;
  const compare = componentCompareAspectsContext?.compare;

  const matchingBaseAspect = base?.find((baseAspect) => baseAspect.aspectId === fileName);
  const matchingCompareAspect = compare?.find((compareAspect) => compareAspect.aspectId === fileName);

  if (!matchingBaseAspect && !matchingCompareAspect) return null;

  const status = getAspectStatus(matchingBaseAspect, matchingCompareAspect);

  if (!status) return null;

  return [() => <ComponentCompareStatusResolver status={status as CompareStatus} />];
}

const UNDEFINED_CONFIG_MARKER = 'undefined';

function getAspectStatus(aspectA?: ComponentAspectData, aspectB?: ComponentAspectData): CompareStatus | null {
  const baseConfig = aspectA?.config || UNDEFINED_CONFIG_MARKER;
  const baseData = aspectA?.data || UNDEFINED_CONFIG_MARKER;
  const compareConfig = aspectB?.config || UNDEFINED_CONFIG_MARKER;
  const compareData = aspectB?.data || UNDEFINED_CONFIG_MARKER;

  if ((isEmpty(baseConfig) && !isEmpty(compareConfig)) || (isEmpty(baseData) && !isEmpty(compareData))) {
    return 'deleted';
  }
  if ((!isEmpty(baseConfig) && isEmpty(compareConfig)) || (!isEmpty(baseData) && isEmpty(compareData))) {
    return 'new';
  }
  if (!isEqual(baseConfig, compareConfig) || !isEqual(baseData, compareData)) {
    return 'modified';
  }
  return null;
}
