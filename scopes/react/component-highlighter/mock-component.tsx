import React, { ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { componentMetaField, ComponentMeta } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

export function MockTarget({ children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest}>{children}</div>;
}
MockTarget[componentMetaField] = {
  id: 'teambit.design/ui/mock-target@1.6.2',
} as ComponentMeta;

export function MockButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest}>{children}</button>;
}
MockButton[componentMetaField] = {
  id: 'teambit.design/ui/icon-button@1.6.2',
} as ComponentMeta;
