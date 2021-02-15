import React, { ReactElement } from 'react';

type Examples = {
  children: [ReactElement, ReactElement];
};

export const ExampleLayout = ({ children }: Examples) => {
  const layout = {
    display: 'grid',
    gridGap: '20px',
    gridTemplateColumns: 'repeat(auto-fill, 600px)',
  };
  return <div style={layout}>{children}</div>;
};
