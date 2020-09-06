import React, { useCallback } from 'react';
import classNames from 'classnames';

import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import { useKeyBind } from '../../hooks/use-bind-key';
import styles from './closeable-card.module.scss';

export const CLOSE_KEY = 'escape';

export type CloseableCardProps = {
  visible: boolean;
  onVisibilityChange: (open: boolean) => void;
} & CardProps;

export function ClosableCard({
  visible = false,
  onVisibilityChange,
  className,
  children,
  ...rest
}: CloseableCardProps) {
  const close = useCallback(() => {
    onVisibilityChange(false);
  }, []);

  useKeyBind(CLOSE_KEY, close, visible);

  return (
    <Card {...rest} className={classNames(styles.closable, visible && styles.visible, className)}>
      <button className={styles.closer} onClick={close}>
        ✕
      </button>
      {children}
    </Card>
  );
}
