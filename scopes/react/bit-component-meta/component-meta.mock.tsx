import React, { ButtonHTMLAttributes } from 'react';
import { ComponentMeta, componentMetaField } from './component-meta';

export function ComponentWithMeta(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} />;
}

ComponentWithMeta[componentMetaField] = {
  // could use a non-bit-id to render the "default" bubble
  id: 'teambit.base-ui/input/button',
} as ComponentMeta;
