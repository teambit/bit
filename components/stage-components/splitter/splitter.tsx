import { Layout } from '@teambit/base-ui-temp.layout.split-pane-layout';
// import { Icon } from '@teambit/evangelist-temp.elements.icon';
// import { Button } from '@bit/bit.gui.atoms.text-button';
import Splitter from '@teambit/base-ui-temp.surfaces.splitter';
import cn from 'classnames';
import React from 'react';

// import { SplitterProps } from '../../splitter-props';
import styles from './splitter.module.scss';

export type SplitterProps = {
  layout: Layout;
  className?: string;
  onDragStarted: () => void;
  onLayoutChange?: (nextLayout?: Layout) => void;
};

export function CollapsibleSplitter(props: SplitterProps) {
  // const toggleCollapse = () => {
  //   const { layout, onLayoutChange } = props;
  //   if (!onLayoutChange) return;
  //   if (layout.includes('first') || layout.includes('last')) {
  //     onLayoutChange(undefined);
  //     return;
  //   }
  //   if (layout.includes(Layout.column)) {
  //     onLayoutChange(Layout.top);
  //     return;
  //   }
  //   if (layout.includes(Layout.row)) {
  //     onLayoutChange(Layout.right);
  //   }
  // };
  // const { layout } = props;
  // const togglerIcon = layoutToIcon(layout);
  return (
    <Splitter {...props} className={cn(styles.collapsibleSplitter, props.className)}>
      {/* <span className={cn('column-handle', styles.handle)}>─</span> */}
      {/* <span className={cn('row-handle', styles.handle)}>|</span> */}
      {/* <span className={styles.actionBox}>
        {togglerIcon && (
          <Button style={{ outline: 'none' }} onClick={toggleCollapse}>
            <Icon of={togglerIcon} />
          </Button>
        )}
      </span> */}
    </Splitter>
  );
}

// function layoutToIcon(layout: Layout) {
//   if (layout.includes('column') && layout.includes('first')) {
//     return 'horizontal';
//   }
//   if (layout.includes('column') && !layout.includes('first')) {
//     return 'horizontal';
//   }
//   if (layout.includes('row') && layout.includes('last')) {
//     return 'vertical-right';
//   }
//   if (layout.includes('row') && !layout.includes('last')) {
//     return 'vertical-left';
//   }
//   return null;
// }
