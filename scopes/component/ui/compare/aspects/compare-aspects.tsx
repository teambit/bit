import React, { HTMLAttributes, useState, useMemo } from 'react';
import classNames from 'classnames';
import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import {
  useComponentCompare,
  useCompareQueryParam,
  useUpdatedUrlFromQuery,
} from '@teambit/component.ui.compare';
import { CodeCompareTree } from '@teambit/code.ui.code-compare';
import { ComponentCompareAspectsContext } from './compare-aspects-context';
import { CompareAspectView } from './compare-aspect-view';
import { Widget } from './compare-aspects.widgets';

import styles from './compare-aspects.module.scss';

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
  const componentCompareContext = useComponentCompare();
  const base = componentCompareContext?.base;
  const compare = componentCompareContext?.compare;

  const isCompareVersionWorkspace = componentCompareContext?.compareIsLocalChanges;

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

  const selectedAspect = useCompareQueryParam('aspect');

  const selected = selectedAspect || (compareAspectList?.length > 0 && compareAspectList[0].aspectId) || undefined;

  const selectedBaseAspect = useMemo(
    () => baseAspectList?.find((baseAspect) => baseAspect.aspectId === selected),
    [baseAspectList, selected]
  );

  const selectedCompareAspect = useMemo(
    () => compareAspectList?.find((compareAspect) => compareAspect.aspectId === selected),
    [compareAspectList, selected]
  );

  const aspectNames = baseAspectList.concat(compareAspectList).map((aspect) => aspect.aspectId);

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
          <CompareAspectView
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
          <CodeCompareTree
            fileTree={aspectNames}
            currentFile={selected}
            drawerName={'ASPECTS'}
            widgets={[Widget]}
            getHref={(node) => useUpdatedUrlFromQuery({ aspect: node.id })}
          />
        </Pane>
      </SplitPane>
    </ComponentCompareAspectsContext.Provider>
  );
}