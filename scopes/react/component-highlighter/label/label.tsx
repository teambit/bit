import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { ComponentMetaHolder } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

import styles from './label.module.scss';
import { ComponentStrip } from './component-strip';
import { OtherComponentsPopper } from './other-components';

export interface LabelProps extends React.HTMLAttributes<HTMLDivElement> {
  components: (ComponentMetaHolder | string)[];
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
