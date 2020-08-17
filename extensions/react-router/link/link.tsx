import React from 'react';
import { Link as BaseLink } from 'react-router-dom';

const EXTERNAL_PROPS = { rel: 'noopener', target: '_blank' };

type LinkProps = {
  /** When true, clicking the link will replace the current entry in the history stack instead of adding a new one */
  replace?: boolean;
  /** Open link in a new tab */
  external?: boolean;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>;

export function Link({ href = '', external, ...rest }: LinkProps) {
  if (external) {
    const externalProps = external ? EXTERNAL_PROPS : {};
    return <a {...rest} {...externalProps} />;
  }

  return <BaseLink {...rest} to={href} />;
}
