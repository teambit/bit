import React, { createRef, useEffect, ChangeEventHandler } from 'react';

import styles from './lane-search.module.scss';

export type LaneSearchProps = {
  onChange: ChangeEventHandler<HTMLInputElement>;
  focus: boolean;
};

export function LaneSearch({ onChange, focus }: LaneSearchProps) {
  const inputRef = createRef<HTMLInputElement>();

  useEffect(() => {
    if (focus) inputRef.current?.focus();
  }, [focus]);

  const handleOnClicked = (e) => {
    inputRef.current?.focus();
    e.stopPropagation();
  };

  return (
    <input
      className={styles.search}
      placeholder={'Search'}
      autoFocus
      onClick={handleOnClicked}
      ref={inputRef}
      onChange={onChange}
    ></input>
  );
}
