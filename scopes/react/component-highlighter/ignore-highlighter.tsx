import React from 'react';

export const excludeHighlighterAttrName = 'data-ignore-component-highlight';

/** select elements matching the exclusion pattern */
export const excludeHighlighterSelector = `[${excludeHighlighterAttrName}]`;

/** elements with these attributes will be ignored by the automatic highlighter */
export const excludeHighlighterAtt = { [excludeHighlighterAttrName]: true };

/** elements under this element will be ignored by the automatic highlighter */
export function ExcludeHighlighter(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} {...excludeHighlighterAtt} />;
}
