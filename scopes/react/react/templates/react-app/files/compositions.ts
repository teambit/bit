import { ComponentContext } from '@teambit/generator';

export function compositionsFile({ namePascalCase: Name }: ComponentContext) {
  return `import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ${Name}App } from './app';

export const ${Name}Basic = () => {
  return (
    <MemoryRouter>
      <${Name}App />
    </MemoryRouter>
  );
};
`;
}
