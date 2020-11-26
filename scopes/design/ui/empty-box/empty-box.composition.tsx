import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { EmptyBox } from './empty-box';

export const EmptyBoxExample = () => {
  return (
    <ThemeContext>
      <EmptyBox
        title="title-test"
        link="https://link-target/"
        linkText="link-text"
        className="test-class"
        data-testid="target"
      />
    </ThemeContext>
  );
};
