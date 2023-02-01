import { Layout } from '@teambit/base-ui.surfaces.split-pane.layout';
import type { PaneProps } from '@teambit/base-ui.surfaces.split-pane.pane';
import type { SplitterProps } from '@teambit/base-ui.surfaces.split-pane.splitter';
import classNames from 'classnames';
import React, { ReactElement, useEffect, useState } from 'react';

import { calcSplit } from './calc-split';
import styles from './split-pane.module.scss';
import { useDragTracker } from './use-drag-tracker';

export type Size = number | string | undefined;

export type SplitPaneProps = React.HTMLAttributes<HTMLDivElement> & {
  size?: Size;
  layout?: Layout;
  children: [ReactElement<PaneProps>, ReactElement<SplitterProps>, ReactElement<PaneProps>];
};

export function SplitPane({ layout = Layout.column, size = '38%', className, children, ...rest }: SplitPaneProps) {
  const containerRef = React.createRef<HTMLDivElement>();
  const [snapshot, isDragging, setDragging] = useDragTracker(containerRef);

  const [[A, B], setLayoutState] = useState(calcSplit(snapshot, layout, size));

  useEffect(() => {
    setLayoutState(calcSplit(snapshot, layout, size));
  }, [snapshot]);

  useEffect(() => {
    setLayoutState(calcSplit(undefined, layout, size));
  }, [size]);

  const [left, splitter, right] = children;
  const leftWithSize = React.cloneElement(left, { size: A, layout });
  const rightWithSize = React.cloneElement(right, { size: B, layout });
  const splitterWithDrag = React.cloneElement(splitter, {
    onDragging: setDragging,
    isDragging,
  });

  return (
    <div
      {...rest}
      ref={containerRef}
      className={classNames(isDragging && styles.isDragging, styles.splitPane, className)}
      data-is-dragging={isDragging}
      data-split-layout={layout}
    >
      {leftWithSize}
      {splitterWithDrag}
      {rightWithSize}
    </div>
  );
}
