import React, { useContext, useState, HTMLAttributes } from 'react';
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
import { APINodeRendererSlot } from '@teambit/api-reference';
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

  // TODO: add loading screen
  if (loading) {
    return <>loading</>;
  }

  // TODO: dont think this will be a valid state - see if we need a blank state
  if (!apiModel) {
    return <>missing schema</>;
  }

  // console.log('🚀 ~ file: api-reference-page.tsx ~ line 17 ~ APIRefPage ~ apiModel', apiModel);

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={className}>
      <Pane className={styles.left}>
        <div className={styles.apiRefPageContainer}>
          <H1 className={styles.title}>API Reference</H1>
          <Separator isPresentational className={styles.separator} />
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
        <>Explorer</>
      </Pane>
    </SplitPane>
  );
}
