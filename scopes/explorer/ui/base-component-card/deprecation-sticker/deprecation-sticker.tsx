import React from 'react';
import classNames from 'classnames';

import styles from './deprecation-sticker.module.scss';

export type DeprecationStickerProps = {
  isDeprecated?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function DeprecationSticker({ isDeprecated }: DeprecationStickerProps) {
  return (
    <div
      className={classNames(styles.deprecated, {
        [styles.show]: isDeprecated,
      })}
    >
      deprecated
    </div>
  );
}
