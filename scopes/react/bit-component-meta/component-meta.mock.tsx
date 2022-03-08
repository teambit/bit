import React, { ButtonHTMLAttributes } from 'react';
import { ComponentMeta, componentMetaField } from './component-meta';

export function MockedComponentWithMeta(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} />;
}

MockedComponentWithMeta[componentMetaField] = {
  // could use a non-bit-id to render the "default" bubble
  id: 'teambit.base-ui/input/button',
} as ComponentMeta;
