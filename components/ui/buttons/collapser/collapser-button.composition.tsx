import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { Collapser } from './collapser-button';

export const CollapserButton = () => {
  return (
    <ThemeCompositions>
      <div style={{ position: 'relative', height: '120px' }}>
        <Collapser isOpen={false} tooltipContent="hover" />
      </div>
    </ThemeCompositions>
  );
};
