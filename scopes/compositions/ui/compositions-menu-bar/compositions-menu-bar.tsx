import React, { useState } from 'react';
import classnames from 'classnames';
import { MenuWidgetIcon } from '@teambit/ui.menu-widget-icon';

import styles from './compositions-menu-bar.module.scss';

interface CompositionsMenuBarProps extends React.HTMLAttributes<HTMLDivElement> {
  onToggleHighlight?: (active: boolean) => void;
}

export function CompositionsMenuBar({ onToggleHighlight, className, ...rest }: CompositionsMenuBarProps) {
  const [active, setActive] = useState(false);

  const handleClick = () => {
    const next = !active;
    setActive(next);
    onToggleHighlight?.(next);
  };

  return (
    <div {...rest} className={classnames(className, styles.compositionsMenuBar)} style={{}}>
      {/* TODO @Uri - extract this to a slot */}
      <MenuWidgetIcon
        icon="code"
        tooltipContent="Component Highlighter (beta)"
        onClick={handleClick}
        className={classnames(styles.toggleHighlightButton, active && styles.active)}
      />
    </div>
  );
}
