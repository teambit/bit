import { Component } from '../component';
import { Workspace } from '../workspace';

export interface Environment {
  dev(workspace: Workspace, components: Component[], options: {}): void;
  // test(): TestResults;
  // release(): void;
  // lint(): void;
  // serve(): void;
}
