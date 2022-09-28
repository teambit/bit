import React, { useContext, useState, HTMLAttributes, useMemo } from 'react';
import flatten from 'lodash.flatten';
import classNames from 'classnames';
import { ComponentContext } from '@teambit/component';
import { H1 } from '@teambit/documenter.ui.heading';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { Separator } from '@teambit/design.ui.separator';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { useSchema } from '@teambit/api-reference.hooks.use-schema';
import { APIReferenceExplorer } from '@teambit/api-reference.explorer.api-reference-explorer';
import { useAPIRefParam } from '@teambit/api-reference.hooks.use-api-ref-url';
import { APINodeRendererSlot } from '@teambit/api-reference';
import { sortAPINodes } from '@teambit/api-reference.utils.sort-api-nodes';
import styles from './api-reference-page.module.scss';

export type APIRefPageProps = {
  host: string;
  rendererSlot: APINodeRendererSlot;
} & HTMLAttributes<HTMLDivElement>;

export function APIRefPage({ host, rendererSlot, className }: APIRefPageProps) {
  const component = useContext(ComponentContext);
  const renderers = flatten(rendererSlot.values());
  const { apiModel, loading } = useSchema(host, component.id.toString(), renderers);
  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  const selectedAPIFromUrl = useAPIRefParam('selectedAPI');
  const [selectedAPIType, selectedAPINodeName] = selectedAPIFromUrl?.split('/') || [];

  const apiNodes = (apiModel && flatten(Array.from(apiModel.apiByType.values())).sort(sortAPINodes)) || [];
  const apiTree: string[] = useMemo(() => {
    return apiNodes.map((apiNode) => {
      return `${apiNode.renderer?.nodeType}/${apiNode.renderer?.getName(apiNode.api)}`;
    });
  }, [apiNodes]);

  const selectedAPINode =
    (selectedAPIType &&
      selectedAPINodeName &&
      apiModel
        ?.getByType(selectedAPIType)
        ?.find((apiNode) => apiNode.renderer.getName(apiNode.api) === selectedAPINodeName)) ||
    apiNodes[0];

  const selectedAPIName =
    (selectedAPINode &&
      `${selectedAPINode?.renderer?.nodeType}/${selectedAPINode?.renderer?.getName(selectedAPINode.api)}`) ||
    apiTree[0];

  const SelectedAPIComponent = selectedAPINode && selectedAPINode.renderer.Component;

  // TODO: add loading screen
  if (loading) {
    return <>loading</>;
  }

  // TODO: dont think this will be a valid state - see if we need a blank state
  if (!apiModel) {
    return <>missing schema</>;
  }
  // console.log("🚀 ~ file: api-reference-page.tsx ~ line 42 ~ APIRefPage ~ selectedAPINode", selectedAPINode)

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={classNames(className, styles.apiRefPageContainer)}>
      <Pane className={styles.left}>
        <div className={styles.selectedAPIDetailsContainer}>
          <H1 size={'md'} className={styles.title}>
            API Reference
          </H1>
          <Separator isPresentational className={styles.separator} />
          {SelectedAPIComponent && <SelectedAPIComponent node={selectedAPINode.api} />}
        </div>
      </Pane>
      <HoverSplitter className={styles.splitter}>
        <Collapser
          placement="left"
          isOpen={isSidebarOpen}
          onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
          onClick={() => setSidebarOpenness((x) => !x)}
          tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} file tree`}
          className={styles.collapser}
        />
      </HoverSplitter>
      <Pane className={classNames(styles.right, styles.dark)}>
        <APIReferenceExplorer selectedAPIName={selectedAPIName} apiTree={apiTree} />
      </Pane>
    </SplitPane>
  );
}
