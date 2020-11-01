import { ComponentType, ReactElement } from 'react';

export type Labels = string[];
export type Abstract = string;
export type Example = {
  title?: string;
  description?: ReactElement;
  scope?: { [key: string]: any };
  jsx?: JSX.Element;
  code: string;
};

export type DocsFile = {
  default?: ComponentType;
  examples: Example[];
  labels: Labels;
  abstract: Abstract;
};
