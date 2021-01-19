import React from 'react';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { ErrorPage } from './error-page';

export const Error404 = () => (
  <ThemeCompositions>
    <ErrorPage code={404} title="This is a 404 error page" />
  </ThemeCompositions>
);

export const Error500 = () => (
  <ThemeCompositions>
    <ErrorPage code={500} title="This is a 500 error page title. So just a general error" />
  </ThemeCompositions>
);

export const ErrorUnknown = () => (
  <ThemeCompositions>
    <ErrorPage code={12345} title="This is what you get if there's no such error page image available" />
  </ThemeCompositions>
);
