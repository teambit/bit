import React from 'react';
import { MDXLayout } from '@teambit/ui.mdx-layout';

export type MdxPageProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function MdxPage({ children }: MdxPageProps) {
  return <MDXLayout>{children}</MDXLayout>;
}
