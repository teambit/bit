import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { EmptyComponentGallery } from './empty-component-gallery';

export const EmptyComponentGalleryExample = () => {
  return (
    <ThemeCompositions>
      <EmptyComponentGallery name="bit.scope" title={'Export components to'} />
    </ThemeCompositions>
  );
};
