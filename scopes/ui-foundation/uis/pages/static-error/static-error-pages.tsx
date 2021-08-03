import React from 'react';
import { NotFoundPage } from '@teambit/design.ui.pages.not-found';
import { ServerErrorPage } from '@teambit/design.ui.pages.server-error';
import { PreviewNotFoundPage } from '@teambit/ui-foundation.ui.pages.preview-not-found';

import { fullPageToStaticString } from '@teambit/ui-foundation.ui.rendering.full-page';

const center = `
  body { 
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;

    font-family: sans-serif;
  }
`;

const assets = {
  style: [center],
  css: ['https://static.bit.dev/fonts/book-font.css'],
};

export function notFound(): string {
  return fullPageToStaticString(<NotFoundPage className="bit-book-font" />, assets);
}

export function serverError(): string {
  return fullPageToStaticString(<ServerErrorPage className="bit-book-font" />, assets);
}

export function noPreview(): string {
  return fullPageToStaticString(<PreviewNotFoundPage className="bit-book-font" />, assets);
}
