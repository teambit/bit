import React from 'react';
import { LinkAnchor } from './link-anchor';
import { LinkContextProvider } from './link-context';

export const Preview = () => {
  return (
    <LinkAnchor navigate={noop} href="/some-link">
      regular link
    </LinkAnchor>
  );
};

export const WithCustomBaseUrl = () => {
  return (
    <LinkContextProvider baseUrl="https://bit.dev">
      <LinkAnchor navigate={noop} href="/some-link">
        regular link
      </LinkAnchor>
    </LinkContextProvider>
  );
};

function noop() {}
