import { Component } from '@teambit/component';
import { Module } from './schemas';

export interface SchemaExtractor {
  /**
   * extract a semantic schema from a component.
   */
  extract(component: Component): Promise<Module>;
}
