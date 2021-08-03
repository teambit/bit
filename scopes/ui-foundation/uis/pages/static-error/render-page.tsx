import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Html, Assets } from '@teambit/ui-foundation.ui.rendering.html';

import { fullPageToStaticString } from '@teambit/ui-foundation.ui.rendering.full-page';

export function fullPageToStaticString(content: ReactNode, assets?: Assets) {
  const html = (
    <Html assets={assets} fullHeight>
      {content}
    </Html>
  );
  const stringified = renderToStaticMarkup(html);

  return stringified;
}
