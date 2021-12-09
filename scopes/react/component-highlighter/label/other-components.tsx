import React from 'react';
import Tippy, { TippyProps } from '@tippyjs/react/headless';
import { ComponentMetaHolder } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

import { ComponentStrip, ComponentStripSize } from './component-strip';
import styles from './label.module.scss';

export type OtherComponentsProps = {
  components: ComponentMetaHolder[];
  size?: ComponentStripSize;
  start?: number;
  end?: number;
} & TippyProps;

// a popper ("tooltip") that shows the additional React Components related to this dom element
export function OtherComponentsPopper({
  components,
  children,
  start,
  end = -1,
  size,
  placement = 'bottom',
  interactive = true,
  ...tippyProps
}: OtherComponentsProps) {
  const content = (
    <>
      {components
        .slice(start, end)
        .reverse()
        .map((comp, idx) => (
          <ComponentStrip key={idx} component={comp} size={size} />
        ))}
    </>
  );

  return (
    <Tippy
      placement={placement}
      interactive={interactive}
      {...tippyProps}
      // second parameter "content" is always undefined, use content inline
      // https://github.com/atomiks/tippyjs-react/issues/341
      render={(attrs) => (
        <div {...attrs} className={styles.othersContainer}>
          {content}
        </div>
      )}
    >
      {children}
    </Tippy>
  );
}
