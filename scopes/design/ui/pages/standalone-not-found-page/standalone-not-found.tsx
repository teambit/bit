import React from 'react';
import { Theme } from '@teambit/base-ui.theme.theme-provider';
import { EvaIconFont } from '@teambit/evangelist.theme.icon-font';
import { NotFoundPage, NotFoundPageProps } from '@teambit/ui.pages.not-found';

export type StandaloneNotFoundProps = NotFoundPageProps;

/** A 404 page with fonts included  */
export function StandaloneNotFoundPage() {
  return (
    <Theme>
      <EvaIconFont query="jyyv17" />
      <NotFoundPage />
    </Theme>
  );
}
