import { ComponentContext } from '@teambit/generator';

export function appRootFile({ namePascalCase: Name }: ComponentContext) {
  return `import React from 'react';
import ReactDOM from 'react-dom';
import { ${Name}App } from './app';

ReactDOM.render(<${Name}App />, document.getElementById('root'));
`;
}
