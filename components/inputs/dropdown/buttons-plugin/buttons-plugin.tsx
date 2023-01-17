import React from 'react';
import classnames from 'classnames';
import { IconButton } from '@teambit/design.ui.icon-button';
import styles from './buttons-plugin.module.scss';

export type ButtonsPluginProps = {
  /**
   * a function that is trigger when clear is clicked.
   */
  onClear?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  /**
   * a function that is trigger when done is clicked.
   */
  onSubmit?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  /**
   * disable the submit button.
   */
  disabledSubmit?: boolean;
  /**
   * text for submit button.
   */
  submitText?: string;
  /**
   * loading status
   */
  loading?: boolean;
  /**
   * className for submit button.
   */
  submitClassName?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function ButtonsPlugin({
  onClear,
  onSubmit,
  disabledSubmit,
  submitText = 'Done',
  loading,
  submitClassName,
  className,
  ...rest
}: ButtonsPluginProps) {
  if (!onClear && !onSubmit) return null;
  return (
    <div {...rest} className={classnames(styles.buttonsHolder, className)}>
      {onClear && (
        <div className={styles.clearText} onClick={onClear}>
          Clear
        </div>
      )}
      {onSubmit && (
        <IconButton
          priority="cta"
          onClick={onSubmit}
          loading={loading}
          disabled={disabledSubmit}
          className={submitClassName}
        >
          {submitText}
        </IconButton>
      )}
    </div>
  );
}
