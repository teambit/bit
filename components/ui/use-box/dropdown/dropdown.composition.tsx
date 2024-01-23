import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { UseBoxDropdown } from './dropdown';

const methods = [
  {
    Title: <img style={{ width: '30px' }} src="https://static.bit.dev/brands/logo-npm-new.svg" />,
    Component: <div>install content</div>,
    order: 1,
  },
  {
    Title: <img style={{ width: '20px' }} src="https://static.bit.dev/brands/bit-logo-text.svg" />,
    Component: <div>import content</div>,
    order: 0,
  },
];

export const UseBoxExample = () => {
  return (
    <ThemeCompositions>
      <div style={{ width: 'fit-content', float: 'right' }}>
        <UseBoxDropdown
          position="bottom-end"
          Menu={
            <div>
              {methods.map(({ Title, Component }, index) => (
                <div key={index}>
                  {Title}
                  {Component}
                </div>
              ))}
            </div>
          }
        />
      </div>
    </ThemeCompositions>
  );
};

UseBoxExample.canvas = {
  height: '400px',
  width: '500px',
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'flex-start',
};
