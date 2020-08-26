import { Layout } from '@teambit/base-ui.surfaces.split-pane.layout';
import Splitter from '@teambit/base-ui.surfaces.split-pane.splitter';
import cn from 'classnames';
import React from 'react';

import styles from './splitter.module.scss';

export type SplitterProps = {
  layout: Layout;
  className?: string;
  onDragStarted: () => void;
  onLayoutChange?: (nextLayout?: Layout) => void;
};

export function CollapsibleSplitter(props: SplitterProps) {
  return <Splitter {...props} className={cn(styles.collapsibleSplitter, props.className)}></Splitter>;
}
