import React from 'react';
import { MDXLayout } from '@teambit/ui.mdx-layout';

export type MDXPageProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function MDXPage({ children }: MDXPageProps) {
  return <MDXLayout>{children}</MDXLayout>;
}
