import React from 'react';
import { NotFoundPage } from '@teambit/design.ui.pages.not-found';
import { ServerErrorPage } from '@teambit/design.ui.pages.server-error';
import { PreviewNotFoundPage } from '@teambit/ui-foundation.ui.pages.preview-not-found';

import { fullPageToStaticString } from '@teambit/ui-foundation.ui.rendering.full-page';

export function notFound(): string {
  return fullPageToStaticString(<NotFoundPage />);
}

export function serverError(): string {
  return fullPageToStaticString(<ServerErrorPage />);
}

export function noPreview(): string {
  return fullPageToStaticString(<PreviewNotFoundPage />);
}
