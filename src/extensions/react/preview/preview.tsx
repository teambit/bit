import React, { Suspense } from 'react';
// import { Component } from '../../composer/component';

export function Preview() {
  // const docsPath = currentComponent().docs;
  // if (!docsPath) return <div>no docs found for this component</div>;
  // const Docs = React.lazy(() => import(/* webpackIgnore: true */ docsPath));
  // import(`.//${}`)

  return (
    <div>
      <Suspense fallback={<div></div>}>{/* <Docs /> */}</Suspense>
    </div>
  );
}
