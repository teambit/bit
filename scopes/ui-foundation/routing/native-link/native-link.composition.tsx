import React from 'react';
import { NativeLink } from './native-link';

export const simpleLink = () => {
  return <NativeLink href="https://bit.dev">Link</NativeLink>;
};

export const openInNewTab = () => {
  return (
    <NativeLink href="https://bit.dev" external>
      External link
    </NativeLink>
  );
};

export const replaceHistory = () => {
  return (
    <NativeLink href="#routing/native-link?preview=compositions" replace>
      go to composition
    </NativeLink>
  );
};
