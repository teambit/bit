import React, { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Html, Assets } from '@teambit/ui-foundation.ui.rendering.html';

export function fullPageToStaticString(content: ReactNode, assets?: Assets) {
  const html = (
    <Html assets={assets} fullHeight>
      {/* @ts-ignore */}
      {content}
    </Html>
  );
  const stringified = renderToStaticMarkup(html);

  return stringified;
}
