import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { EmptyComponentGallery } from './empty-component-gallery';

export const EmptyComponentGalleryExample = () => {
  return (
    <ThemeContext>
      <EmptyComponentGallery name="bit.scope" />
    </ThemeContext>
  );
};
