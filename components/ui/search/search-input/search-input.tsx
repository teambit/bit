import React, { useEffect } from 'react';
import { IconTextInput, IconTextInputProps, IconTextInputWithRef } from '@teambit/design.ui.input.icon-text';
import { Icon } from '@teambit/design.elements.icon';

import styles from './search-input.module.scss';

export type SearchInputProps = {
  /**
   * ref to forward to the input element
   */
  ref?: React.Ref<HTMLInputElement>;
} & IconTextInputProps;

export function SearchInput({ placeholder = 'Search', onSubmit, ref, onMount, ...rest }: SearchInputProps) {
  const onKeyUp = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      onSubmit && onSubmit(event);
    }
  };

  if (ref) {
    return (
      <IconTextInputWithRef
        ref={ref}
        placeholder={placeholder}
        filled
        icon={<Icon of="magnifying" className={styles.searchIcon} />}
        onSubmit={onSubmit}
        onKeyUp={onKeyUp}
        {...rest}
      />
    );
  }

  return (
    <IconTextInput
      placeholder={placeholder}
      filled
      icon={<Icon of="magnifying" className={styles.searchIcon} />}
      onSubmit={onSubmit}
      onKeyUp={onKeyUp}
      {...rest}
    />
  );
}

export const SearchInputWithRef = React.forwardRef(function IconTextInputRefWrapper(
  props: SearchInputProps,
  ref: React.Ref<HTMLInputElement>
) {
  return <SearchInput {...{ ...props, ref }} />;
});
