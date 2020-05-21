import React, { Suspense } from 'react';
import { Component } from '../composer/component';

export function Preview() {
  const docsPath = currentComponent().docs;
  if (!docsPath) return <div>no docs found for this component</div>;
  // const Docs = React.lazy(() => import(/* webpackIgnore: true */ docsPath));
  // import(`.//${}`)

  return (
    <div>
      <Suspense fallback={<div></div>}>{/* <Docs /> */}</Suspense>
    </div>
  );
}

export function currentComponent(): Component {
  const urlParams = new URLSearchParams(window.location.search);
  const encodedComponent = urlParams.get('component');
  return JSON.parse(atob(encodedComponent || '{}'));
}
