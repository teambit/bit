import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import Tippy, { TippyProps } from '@tippyjs/react/headless';
import { ComponentMetaHolder } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

import styles from './label.module.scss';
import { ComponentStrip } from './component-strip';

export interface LabelProps extends React.HTMLAttributes<HTMLDivElement> {
  components: ComponentMetaHolder[];
}

export function Label({ components, ...props }: LabelProps) {
  const [showMore, setShowMore] = useState(false);
  const last = components.slice(-1).pop();
  if (!last) return null;

  const hasMore = components.length > 1;

  // reset when switching targets
  useEffect(() => {
    setShowMore(false);
  }, [components]);

  return (
    <OtherComponentsPopper components={components} visible={showMore} placement="bottom-start">
      <ComponentStrip {...props} component={last}>
        {hasMore && (
          <span
            className={classNames(styles.othersTooltip, showMore && styles.active)}
            onClick={() => setShowMore((x) => !x)}
          />
        )}
      </ComponentStrip>
    </OtherComponentsPopper>
  );
}

type OtherComponentsProps = {
  components: ComponentMetaHolder[];
  start?: number;
  end?: number;
} & TippyProps;

// a popper ("tooltip") that shows the additional React Components related to this dom element
export function OtherComponentsPopper({
  components,
  children,
  placement = 'bottom',
  interactive = true,
  start,
  end = -1,
  ...tippyProps
}: OtherComponentsProps) {
  const content = (
    <>
      {components
        .slice(start, end)
        .reverse()
        .map((comp, idx) => (
          <ComponentStrip key={idx} component={comp} />
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
