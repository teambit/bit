import React from 'react';
import { FileIconSlot } from '@teambit/code';
import { Section } from '@teambit/component';
import { CodeCompare } from '@teambit/code.ui.code-compare';

export class CodeCompareSection implements Section {
  constructor(private fileIconSlot?: FileIconSlot) {}

  navigationLink = {
    href: 'code',
    children: 'Code',
    order: 4,
  };

  route = {
    path: 'code/*',
    element: <CodeCompare fileIconSlot={this.fileIconSlot} />,
  };
}
