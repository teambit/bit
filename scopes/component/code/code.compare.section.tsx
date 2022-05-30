import React from 'react';
import { FileIconSlot } from '@teambit/code';
import { Section } from '@teambit/component';
import { ComponentCompareCode } from '@teambit/component.ui.component-compare-code';

export class CodeCompareSection implements Section {
  constructor(private fileIconSlot: FileIconSlot) {}

  navigationLink = {
    href: 'code',
    children: 'Code',
    order: 2,
  };

  route = {
    path: 'code/*',
    element: <ComponentCompareCode fileIconSlot={this.fileIconSlot} />,
  };
}
