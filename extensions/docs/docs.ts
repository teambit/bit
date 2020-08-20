import React from 'react';

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
};
