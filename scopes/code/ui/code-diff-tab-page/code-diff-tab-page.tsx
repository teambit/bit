import { ComponentContext, ComponentID } from '@teambit/component';
import classNames from 'classnames';
import React, { useContext, useState, HTMLAttributes } from 'react';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { Collapser } from '@teambit/ui-foundation.ui.buttons.collapser';
import { useCode } from '@teambit/code.ui.queries.get-component-code';
import type { FileIconSlot } from '@teambit/code';
import { CodeDiffView } from '@teambit/code.ui.code-diff-view';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { useCodeDiffParams } from '@teambit/code.ui.hooks.use-code-diff-params';
import styles from './code-diff-tab-page.module.scss';

export type CodeDiffPageWrapperProps = {
  fileIconSlot?: FileIconSlot;
} & HTMLAttributes<HTMLDivElement>;

export function CodeDiffPageWrapper(props: CodeDiffPageWrapperProps) {
  const { toVersion, fromVersion, file } = useCodeDiffParams();
  const component = useContext(ComponentContext);

  const toComponentId = (toVersion && component.id.changeVersion(toVersion)) || undefined;

  if (!toComponentId) return null;
  const fromComponentId = (fromVersion && component.id.changeVersion(fromVersion)) || component.id;

  return <CodeDiffPage {...{ fromComponentId, toComponentId, ...props, fileName: file }} />;
}

type CodeDiffPageProps = {
  fileIconSlot?: FileIconSlot;
  toComponentId: ComponentID;
  fromComponentId: ComponentID;
  fileName?: string;
} & HTMLAttributes<HTMLDivElement>;

function CodeDiffPage({ className, toComponentId, fromComponentId, fileName }: CodeDiffPageProps) {
  const { mainFile: fromMainFile } = useCode(fromComponentId);
  const currentFile = fileName || (fromMainFile as string);

  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpenness] = useState(!isMobile);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.left;

  return (
    <SplitPane layout={sidebarOpenness} size="85%" className={classNames(styles.codePage, className)}>
      <Pane className={styles.left}>
        <CodeDiffView to={toComponentId} currentFile={currentFile} from={fromComponentId} />
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
      <Pane className={styles.right}></Pane>
    </SplitPane>
  );
}
