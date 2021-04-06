import Vinyl from 'vinyl';
import fs from 'fs-extra';
import pMapSeries from 'p-map-series';
import path from 'path';
import { Workspace } from '@teambit/workspace';
import { EnvsMain } from '@teambit/envs';
import camelcase from 'camelcase';
import { PathOsBasedRelative } from '@teambit/legacy/dist/utils/path';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import { ComponentID } from '@teambit/component-id';
import { WorkspaceTemplate } from './workspace-template';
import { NewOptions } from './new.cmd';

export type GenerateResult = { id: ComponentID; dir: string; files: string[]; envId: string };

export class WorkspaceGenerator {
  constructor(
    private workspaceName: string,
    private options: NewOptions,
    private template: WorkspaceTemplate,
    private envs: EnvsMain
  ) {}

  async generate(): Promise<GenerateResult[]> {
    // return generateResults;
  }
}
