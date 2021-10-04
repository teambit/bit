import React, { useCallback, useEffect, createRef, InputHTMLAttributes } from 'react';
import classNames from 'classnames';
import styles from './autocomplete-input.module.scss';

type AutoCompleteInputProps = InputHTMLAttributes<HTMLInputElement> & {
  onEscape?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onUp?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onEnter?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  focus?: Truthy;
};

type Truthy = boolean | number | string | null | undefined;

export function AutoCompleteInput({
  className,
  onEscape,
  onDown,
  onUp,
  onEnter,
  onKeyDown,
  focus,
  ...rest
}: AutoCompleteInputProps) {
  const inputRef = createRef<HTMLInputElement>();

  useEffect(() => {
    if (focus) inputRef.current?.focus();
  }, [focus]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;

      const handlers = {
        Escape: () => {
          e.preventDefault();
          onEscape?.(e);
        },
        ArrowDown: () => {
          e.preventDefault();
          onDown?.(e);
        },
        ArrowUp: () => {
          e.preventDefault();
          onUp?.(e);
        },
        Enter: () => {
          e.preventDefault();
          onEnter?.(e);
        },
      };

      if (e.key in handlers) handlers[e.key]();
    },
    [onEscape, onDown, onUp, onEnter]
  );

  // @ts-ignore (https://github.com/teambit/bit/issues/4908)
  return <input {...rest} ref={inputRef} className={classNames(styles.input, className)} onKeyDown={handleKeyDown} />;
}
