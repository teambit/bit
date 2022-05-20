import React, { HTMLAttributes, useState } from 'react';
import classNames from 'classnames';
import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { ComponentCompareCodeTree } from '@teambit/component.ui.component-compare-code';
import { useComponentCompareContext, useComponentCompareParams } from '@teambit/component.ui.component-compare';
import { ComponentCompareAspectView } from './component-compare-aspect-view';

import styles from './component-compare-aspects.module.scss';

export type ComponentCompareAspectsProps = {} & HTMLAttributes<HTMLDivElement>;
export type ComponentAspectData = {
  icon?: string;
  name?: string;
  config: any;
  data: any;
  id: string;
};

const GET_COMPONENT_ASPECT_DATA = gql`
  query GetComponentAspectData($id: String!) {
    getHost {
      get(id: $id) {
        aspects {
          id
          config
          data
          icon
        }
      }
    }
  }
`;

export function ComponentCompareAspects({ className }: ComponentCompareAspectsProps) {
  const componentCompareContext = useComponentCompareContext();

  const { base, compare } = componentCompareContext || {};
  const { data: baseAspectData, loading: baseLoading } = useDataQuery(GET_COMPONENT_ASPECT_DATA, {
    variables: { id: base?.id.toString() },
    skip: !base?.id,
  });
  const { data: compareAspectData, loading: compareLoading } = useDataQuery(GET_COMPONENT_ASPECT_DATA, {
    variables: { id: compare?.id.toString() },
    skip: !compare?.id,
  });
  const loading = baseLoading || compareLoading;
  const baseAspectList: ComponentAspectData[] = baseAspectData?.getHost?.get?.aspects;
  const compareAspectList: ComponentAspectData[] = compareAspectData?.getHost?.get?.aspects;
  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;
  const params = useComponentCompareParams();
  const selected =
    params?.selectedAspect || (!loading && compareAspectList?.length > 0 && compareAspectList[0].id) || undefined;
  const selectedBaseAspect = baseAspectList?.find((baseAspect) => baseAspect.id === selected);
  const selectedCompareAspect = compareAspectList?.find((compareAspect) => compareAspect.id === selected);
  const aspectNames = (baseAspectList || []).concat(compareAspectList || []).map((aspect) => aspect.id);

  return (
    <SplitPane
      layout={sidebarOpenness}
      size="85%"
      className={classNames(styles.componentCompareAspectContainer, className)}
    >
      <Pane className={styles.left}>
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
        />
      </Pane>
    </SplitPane>
  );
}
