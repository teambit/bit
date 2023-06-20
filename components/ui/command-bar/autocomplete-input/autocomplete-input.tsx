import React, { useEffect, createRef, InputHTMLAttributes } from 'react';
import classNames from 'classnames';
import styles from './autocomplete-input.module.scss';

type AutoCompleteInputProps = InputHTMLAttributes<HTMLInputElement> & {
  focus?: Truthy;
};

type Truthy = boolean | number | string | null | undefined;

export function AutoCompleteInput({ className, focus, ...rest }: AutoCompleteInputProps) {
  const inputRef = createRef<HTMLInputElement>();

  useEffect(() => {
    if (focus) inputRef.current?.focus();
    else inputRef.current?.blur();
  }, [focus]);

  // @ts-ignore (https://github.com/teambit/bit/issues/4908)
  return <input {...rest} ref={inputRef} className={classNames(styles.input, className)} />;
}
