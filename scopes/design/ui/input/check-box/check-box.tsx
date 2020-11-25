import React, { ReactNode } from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';

import styles from './check-box.module.scss';

type CheckBoxProps = {
  checkMark?: ReactNode;
  containerClass?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  | 'height'
  | 'max'
  | 'maxLength'
  | 'min'
  | 'minLength'
  | 'multiple'
  | 'pattern'
  | 'placeholder'
  | 'size'
  | 'src'
  | 'type'
  | 'value'
  | 'width'
  | 'children'
>;

const checkMarkElement = <Icon of="check-mark" className={styles.icon} />;

export function CheckBox(props: CheckBoxProps) {
  return (
    <BaseCheckbox
      {...props}
      containerClass={classNames(styles.container, props.containerClass)}
      className={classNames(props.className, styles.checkbox)}
      checkMark={checkMarkElement}
    />
  );
}

function BaseCheckbox(props: CheckBoxProps) {
  const { inputProps, fakeCheckboxProps, checkMark, containerClass } = separateProps(props);

  return (
    <label className={classNames(styles.baseCheckboxContainer, containerClass)}>
      <input type="checkbox" {...inputProps} />
      {/* span receives main `className` */}
      <span {...fakeCheckboxProps} className={classNames(styles.baseCheckbox, fakeCheckboxProps.className)}>
        {checkMark}
      </span>
    </label>
  );
}

function separateProps(props: CheckBoxProps) {
  const {
    className,
    containerClass,
    checkMark,

    // input props:
    tabIndex,
    autoComplete,
    autoFocus,
    capture,
    checked,
    crossOrigin,
    disabled,
    form,
    formAction,
    formEncType,
    formMethod,
    formNoValidate,
    formTarget,
    list,
    required,
    readOnly,
    name,
    step,

    defaultChecked,
    defaultValue,

    // // omitted:
    // height,
    // max,
    // maxLength,
    // min,
    // minLength,
    // multiple,
    // pattern,
    // placeholder,
    // size,
    // src,
    // type,
    // value,
    // width,
    ...rest
  } = props;

  return {
    inputProps: {
      // input props:
      tabIndex,
      autoComplete,
      autoFocus,
      capture,
      checked,
      crossOrigin,
      disabled,
      form,
      formAction,
      formEncType,
      formMethod,
      formNoValidate,
      formTarget,
      name,
      list,
      required,
      readOnly,
      step,
      defaultChecked,
      defaultValue,
    },
    fakeCheckboxProps: {
      className,
      ...rest,
    },
    containerClass,
    checkMark,
  };
}
