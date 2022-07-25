import { MainRuntime } from '@teambit/cli';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { BitId } from '@teambit/legacy-bit-id';
import ComponentAspect, { ComponentID, ComponentMain } from '@teambit/component';
import {
  diffBetweenVersionsObjects,
  DiffResults,
  DiffOptions,
} from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import { componentCompareSchema } from './component-compare.graphql';
import { ComponentCompareAspect } from './component-compare.aspect';

type FileDiff = {};

type FieldDiff = {};

export type ComponentCompareResult = {
  hasDiff: boolean;
  code: {
    newFiles: {
      fileName: string;
    };
  };
};

export class ComponentCompareMain {
  constructor(private componentAspect: ComponentMain, private scope: ScopeMain, private logger: Logger) {}

  async compare(from: ComponentID, to: ComponentID): Promise<ComponentCompareResult> {
    const result: ComponentCompareResult = {
      newComps: [],
      unchangedComps: [],
      modifiedComps: [],
    };

    const host = this.componentAspect.getHost();

    return result;
  }

  static slots = [];
  static dependencies = [GraphqlAspect, ComponentAspect, ScopeAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([graphql, component, scope, loggerMain]: [GraphqlMain, ComponentMain, ScopeMain, LoggerMain]) {
    const logger = loggerMain.createLogger(ComponentCompareAspect.id);
    const componentCompareMain = new ComponentCompareMain(component, scope, logger);
    graphql.register(componentCompareSchema(componentCompareMain));
    return componentCompareMain;
  }
}
