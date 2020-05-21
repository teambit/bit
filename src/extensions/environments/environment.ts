import { Component } from '../component';
import { Workspace } from '../workspace';

export interface Environment {
  dev(workspace: Workspace, components: Component[]): void;
  // test(): TestResults;
  // release(): void;
  // lint(): void;
  // serve(): void;
}
