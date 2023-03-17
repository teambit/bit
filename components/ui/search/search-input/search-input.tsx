import React from 'react';
import { IconTextInput, IconTextInputProps } from '@teambit/design.ui.input.icon-text';
import { Icon } from '@teambit/design.elements.icon';

import styles from './search-input.module.scss';

export type SearchInputProps = {
  /**
   * ref to forward to the input element
   */
  inputRef?: React.Ref<HTMLInputElement>;
} & IconTextInputProps;

function _SearchInput({ placeholder = 'Search', onSubmit, inputRef, ...rest }: SearchInputProps) {
  const onKeyUp = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      onSubmit?.(event);
    }
  };

  return (
    <IconTextInput
      inputRef={inputRef}
      placeholder={placeholder}
      filled
      icon={<Icon of="magnifying" className={styles.searchIcon} />}
      onSubmit={onSubmit}
      onKeyUp={onKeyUp}
      {...rest}
    />
  );
}

export const SearchInput = React.forwardRef(function IconTextInputRefWrapper(
  props: SearchInputProps,
  inputRef: React.Ref<HTMLInputElement>
) {
  return <_SearchInput {...{ ...props, inputRef }} />;
});
