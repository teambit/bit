import React, { ReactElement } from 'react';

export type Example = {
  title?: string;
  description?: ReactElement;
  scope?: { [key: string]: any };
  jsx?: JSX.Element;
  code: string;
};

export type Docs = {
  /**
   * default is the docs content.
   */
  default: React.ComponentType;

  /**
   * component abstract.
   */
  abstract: string;

  /**
   * array of labels.
   */
  labels: string[];

  /**
   * @deprecated
   */
  examples: Example[];
};

export const defaultDocs: Docs = {
  default: () => null,
  labels: [],
  abstract: '',
  examples: [],
};
