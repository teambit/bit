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

const sizing = `
  body {
    font-size: 18px;
    color: #878c9a;
    width: 100% !important;
    height: 500px;
  }

  @media screen and (max-width: 250px) {
    body {
      font-size: 14px;
      color: #c7c7c7;
    }
  }
`;

const assets = {
  style: [center],
  css: [staticBookFontUrl],
};

const noPreviewAssets = {
  style: [center, sizing],
  css: [staticBookFontUrl],
};

export function notFound(): string {
  return fullPageToStaticString(<NotFoundPage className={staticBookFontClass} />, assets);
}

export function serverError(): string {
  return fullPageToStaticString(<ServerErrorPage className={staticBookFontClass} />, assets);
}

export function noPreview(): string {
  return fullPageToStaticString(<PreviewNotFoundPage className={staticBookFontClass} />, noPreviewAssets);
}
