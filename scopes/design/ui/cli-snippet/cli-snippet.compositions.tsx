import React from 'react';
import { CliSnippet } from './index';

const content = `this is some cli content\n which should be rendered properly as html`;

export const CliSnippetExample = () => {
  return <CliSnippet content={content} />;
};
