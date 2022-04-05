import React from 'react';

/** name of ignore attribute */
export const excludeHighlighterAttrName = 'data-ignore-component-highlight';

/** selector for elements with the ignore attribute */
export const excludeHighlighterSelector = `[${excludeHighlighterAttrName}]`;

/** highlighter will exclude elements with this attribute */
export const excludeHighlighterAtt = { [excludeHighlighterAttrName]: true };

/** children of this element will be excluded by the automatic highlighter */
export function ExcludeHighlighter(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} {...excludeHighlighterAtt} />;
}

/** name of skip attribute */
export const skipHighlighterAttrName = 'data-skip-component-highlight';
/** highlighter will skip (ignore) elements with these attributes */
export const skipHighlighterAttr = { [skipHighlighterAttrName]: true };
/** selector for elements with the skip attribute */
export const skipHighlighterSelector = `[${skipHighlighterAttrName}]`;
