import React, { createRef, useEffect, ChangeEventHandler } from 'react';

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

  return <input autoFocus onClick={handleOnClicked} ref={inputRef} onChange={onChange}></input>;
}
