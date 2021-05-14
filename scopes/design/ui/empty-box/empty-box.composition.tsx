import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { EmptyBox } from './empty-box';

export const EmptyBoxExample = () => {
  return (
    <ThemeCompositions>
      <EmptyBox
        title="title-test"
        link="https://link-target/"
        linkText="link-text"
        className="test-class"
        data-testid="target"
      />
    </ThemeCompositions>
  );
};

export const EmptyBoxExampleWithLongText = () => {
  return (
    <ThemeCompositions>
      <EmptyBox
        title="There are no compositions for this component."
        link="https://link-target/"
        linkText="Learn how to create compositions"
        className="test-class"
        data-testid="target"
      />
    </ThemeCompositions>
  );
};
