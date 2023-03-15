import React from 'react';
import { IconText, IconTextProps } from '@teambit/design.ui.input.icon-text';

export type SearchInputProps = IconTextProps;

export function SearchInput({ icon = 'discovery', placeholder = 'Search', onSubmit, ...rest }: SearchInputProps) {
  const onKeyUp = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      onSubmit && onSubmit();
    }
  };

  return <IconText placeholder={placeholder} filled icon={icon} onSubmit={onSubmit} onKeyUp={onKeyUp} {...rest} />;
}
