import React from 'react';
import { NotFoundPage, NotFoundPageProps } from '@teambit/design.ui.pages.not-found';

export type StandaloneNotFoundProps = NotFoundPageProps;

/** A 404 page with fonts included  */
export function StandaloneNotFoundPage() {
  return <NotFoundPage style={{ fontFamily: '"Helvetica Neue",Helvetica, sans-serif' }} />;
}
