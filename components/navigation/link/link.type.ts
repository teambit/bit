import { ComponentType, RefAttributes, AnchorHTMLAttributes } from 'react';

/**
 * A standard Link component interface.
 */
export type LinkType = ComponentType<LinkProps>;

/**
 * A standard API schema for a Link component.
 */

export interface BaseLinkProps {
  /**
   * key-value state for stateful routing systems. (Has to be supported by the speicifc link implementation)
   */
  state?: Record<string, any>;

  /**
   * force the use of a native `a` element and ignore the contextual implemented Link.
   */
  native?: boolean;

  /** open the link in a new page (renders as native link) */
  external?: boolean;

  /** class to apply when `href` matches the current location */
  activeClassName?: string;
  /** styles to apply when `href` matches the current location */
  activeStyle?: React.CSSProperties;
  /**
   * explicitly apply active styles.
   * If left undefined, the link will automatically become "active" if href matches the current url.
   */
  active?: boolean;
  /** href should match url exactly to set as active, when using active="auto" */
  exact?: boolean;
  /** include trailing slash on the location pathname, when using active="auto"  */
  strict?: boolean;
  nonce?: string;
}

export interface LinkProps
  extends BaseLinkProps,
    RefAttributes<HTMLAnchorElement>,
    AnchorHTMLAttributes<HTMLAnchorElement> {}

export type Location<StateType = {}> = {
  /** Returns the Location object's URL's fragment (includes leading "#" if non-empty). */
  hash: string;
  /* Returns the Location object's URL's path. */
  pathname: string;
  /* Returns the Location object's URL's query (includes leading "?" if non-empty). */
  search: string;

  /* (implementation specific) Returns the state associated with the current history entry */
  state?: StateType;
  /* (implementation specific) Returns the key associated with the current history entry */
  key?: string;
};

export type UseLocation<StateType extends {} = {}> = () => Location<StateType>;

export interface Navigator {
  (to: string, options?: { replace?: boolean }): void;
  (delta: number): void;
}

export type UseNavigate = () => Navigator;
