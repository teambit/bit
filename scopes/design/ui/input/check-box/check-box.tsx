import React, { ReactNode, useCallback, createRef, MouseEventHandler } from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';

import styles from './check-box.module.scss';

export type CheckBoxProps = {
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
  const { inputProps, fakeCheckboxProps, children, checkMark, containerClass } = separateProps(props);

  const inputRef = createRef<HTMLInputElement>();

  const handleClick = useCallback<MouseEventHandler<HTMLInputElement>>((...args) => {
    const [e] = args;
    // should we change target?
    fakeCheckboxProps.onClick?.(...args);
    if (e.defaultPrevented) return;

    inputRef.current?.focus();
  }, []);

  return (
    <label className={classNames(styles.baseCheckboxContainer, containerClass)}>
      <input ref={inputRef} type="checkbox" {...inputProps} />

      {/* span receives main `className` */}
      <span
        {...fakeCheckboxProps}
        onClick={handleClick}
        className={classNames(styles.baseCheckbox, fakeCheckboxProps.className)}
      >
        {checkMark}
      </span>
      {children}
    </label>
  );
}

function separateProps(props: CheckBoxProps) {
  const {
    className,
    children,
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

    onChange,
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
      onChange,
      defaultChecked,
      defaultValue,
    },
    fakeCheckboxProps: {
      className,
      ...rest,
    },
    containerClass,
    checkMark,
    children,
  };
}
