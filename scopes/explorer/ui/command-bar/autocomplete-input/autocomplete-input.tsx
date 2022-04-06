import React, { useRef, useCallback, useEffect, createRef, InputHTMLAttributes } from 'react';
import classNames from 'classnames';
import styles from './autocomplete-input.module.scss';

type KeyHandlers = Record<string, (e: React.KeyboardEvent<HTMLInputElement>) => void>;
type AutoCompleteInputProps = InputHTMLAttributes<HTMLInputElement> & {
  keyHandlers: KeyHandlers;
  focus?: Truthy;
};

type Truthy = boolean | number | string | null | undefined;

export function AutoCompleteInput({ className, keyHandlers, onKeyDown, focus, ...rest }: AutoCompleteInputProps) {
  const inputRef = createRef<HTMLInputElement>();

  useEffect(() => {
    if (focus) inputRef.current?.focus();
  }, [focus]);

  const handleKeyDown = useKeyHandler(keyHandlers, onKeyDown);

  // @ts-ignore (https://github.com/teambit/bit/issues/4908)
  return <input {...rest} ref={inputRef} className={classNames(styles.input, className)} onKeyDown={handleKeyDown} />;
}

function useKeyHandler(callbacks: KeyHandlers, onEvent?: (e: React.KeyboardEvent<HTMLInputElement>) => void) {
  const ref = useRef(callbacks);
  ref.current = callbacks;

  return useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      onEvent?.(e);
      if (e.defaultPrevented) return;

      const callback = ref.current.callbacks[e.key];
      if (!callback) return;

      e.preventDefault();
      callback(e);
    },
    [onEvent]
  );
}
