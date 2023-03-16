import React, { ReactElement } from 'react';
import classNames from 'classnames';
import { TextInput, TextProps } from '@teambit/design.ui.input.text';
import styles from './icon-text.module.scss';

export type IconTextInputProps = {
  /**
   * An optional Icon element to be render at the end of the input, can be an Image or an Icon.
   */
  icon?: ReactElement;
  /**
   * input override class
   */
  inputClass?: string;
  /**
   * ref to forward to the input element
   */
  ref?: React.Ref<HTMLInputElement>;
} & TextProps;

export function IconTextInput({ icon, inputClass, className, style, value, ref, ...rest }: IconTextInputProps) {
  return (
    <div className={classNames(styles.iconTextInput, icon && styles.withIcon, className)} style={style}>
      <TextInput ref={ref} className={classNames(styles.input, inputClass)} value={value} {...rest} />
      {icon}
    </div>
  );
}

export const IconTextInputWithRef = React.forwardRef(function IconTextInputRefWrapper(
  props: IconTextInputProps,
  ref: React.Ref<HTMLInputElement>
) {
  return <IconTextInput {...{ ...props, ref }} />;
});
