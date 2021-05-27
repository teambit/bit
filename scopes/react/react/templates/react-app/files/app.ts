import { ComponentContext } from '@teambit/generator';

export function appFile({ namePascalCase: Name }: ComponentContext) {
  return `import React from 'react';
import { BrowserRouter, Switch, Route } from 'react-router-dom';

export function ${Name}App() {
  return (
    <BrowserRouter>

       {/* header component */}

        <Switch>
          <Route path="/">
             {/* home page component */}
          </Route>

          <Route path="/about">
             {/* about page component */}
          </Route>

        </Switch>

        {/* footer component */}

    </BrowserRouter>
  );
}
`;
}
