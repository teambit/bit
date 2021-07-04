import { ComponentContext } from '@teambit/generator';

export function compositionsFile({ namePascalCase: Name }: ComponentContext) {
  return `import React from 'react';
import { ${Name}App } from './app';

export const ${Name}Basic = () => {
  return <${Name}App></${Name}App>;
};
`;
}
