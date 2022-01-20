import { ComponentContext } from '@teambit/generator';

export function appRootFile({ namePascalCase: Name }: ComponentContext) {
  return `import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter } from 'react-router-dom';
import { ${Name}App } from './app';

ReactDOM.render((
  <BrowserRouter>
    <${Name}App />
  </BrowserRouter>
), document.getElementById('root'));

`;
}
