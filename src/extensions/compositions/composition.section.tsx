import React from 'react';
import { Section } from '../component/section';
import { ComponentComposition } from './ui';
import { CompositionsExtension } from './compositions.extension';

export class CompositionsSection implements Section {
  constructor(
    /**
     * simulations ui extension.
     */
    private compositions: CompositionsExtension
  ) {}

  navigationLink = {
    to: '~compositions',
    children: 'Compositions'
  };

  route = {
    path: '~compositions',
    children: <ComponentComposition />
  };
}
