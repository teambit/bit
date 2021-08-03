import React from 'react';
import { staticBookFontClass, staticBookFontUrl } from '@teambit/base-ui.theme.fonts.book';
import { NotFoundPage } from '@teambit/design.ui.pages.not-found';
import { ServerErrorPage } from '@teambit/design.ui.pages.server-error';
import { PreviewNotFoundPage } from '@teambit/ui-foundation.ui.pages.preview-not-found';

import { fullPageToStaticString } from './render-page';

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
  css: [staticBookFontUrl],
};

export function notFound(): string {
  return fullPageToStaticString(<NotFoundPage className={staticBookFontClass} />, assets);
}

export function serverError(): string {
  return fullPageToStaticString(<ServerErrorPage className={staticBookFontClass} />, assets);
}

export function noPreview(): string {
  return fullPageToStaticString(<PreviewNotFoundPage className={staticBookFontClass} />, assets);
}
