import React, { CSSProperties, useEffect, createRef } from 'react';
import { ComponentModel } from '@teambit/component';
import queryString from 'query-string';

import styles from './preview.module.scss';

export type ComponentPreviewProps = {
  /**
   * component to preview.
   */
  component: ComponentModel;

  /**
   * preview name.
   */
  previewName?: string;

  /**
   * preview style.
   */
  style?: CSSProperties;

  /**
   * string in the format of query params. e.g. foo=bar&bar=there
   */
  queryParams?: string;

  /**
   * enable/disable hot reload for the composition preview.
   */
  hotReload: boolean;
};

/**
 * renders a preview of a component.
 */
export function ComponentPreview({ component, style, previewName, queryParams }: ComponentPreviewProps) {
  const serverPath = toPreviewServer(component);
  const hash = toPreviewHash(component, previewName, queryParams);

  return <iframe style={style} src={`${serverPath}/#${hash}`} />;
}

ComponentPreview.defaultProps = {
  hotReload: true,
};

/**
 * create a string segment
 * append a prefix and a suffix to a string, only if defined
 */
function optional(prefix = '', str?: string, suffix = '') {
  if (!str) return '';

  return `${prefix}${str}${suffix}`;
}

/**
 * generates preview server path from component data
 */
export function toPreviewServer(component: ComponentModel) {
  // TODO  - check if this is needed
  const defaultServerUrl = `/api/${component.id.fullName}/@/preview`;

  return component.server?.url || defaultServerUrl;
}

/**
 * creates component preview arguments
 */
export function toPreviewHash(
  /**
   * component to preview
   */
  component: ComponentModel,
  /**
   * current preview (docs, compositions, etc)
   */
  previewName?: string,
  /**
   * extra data to append to query
   */
  queryParams = ''
) {
  const queryItems = [optional(`preview=`, previewName)]
    .concat(queryParams)
    // also removes empty strings
    .filter((x) => !!x);

  const hashQuery = queryItems.join('&');
  const hash = `${component.id.fullName}${optional('?', hashQuery)}`;

  return hash;
}
