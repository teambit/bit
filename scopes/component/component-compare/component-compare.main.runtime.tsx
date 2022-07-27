import { MainRuntime } from '@teambit/cli';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import {
  diffBetweenVersionsObjects,
  DiffResults,
  FileDiff,
} from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import ComponentAspect, { ComponentMain } from '@teambit/component';
import { componentCompareSchema } from './component-compare.graphql';
import { ComponentCompareAspect } from './component-compare.aspect';

export type ComponentCompareResult = {
  id: string;
  code: FileDiff[];
};

export class ComponentCompareMain {
  constructor(private componentAspect: ComponentMain, private scope: ScopeMain) {}

  async compare(baseIdStr: string, compareIdStr: string): Promise<ComponentCompareResult> {
    const host = this.componentAspect.getHost();
    const [baseCompId, compareCompId] = await host.resolveMultipleComponentIds([baseIdStr, compareIdStr]);
    const modelComponent = await this.scope.legacyScope.getModelComponentIfExist(compareCompId._legacy);
    if (!modelComponent) {
      throw new GeneralError(`component ${compareCompId.toString()} doesn't have any version yet`);
    }

    const baseVersion = baseCompId.version as string;
    const compareVersion = compareCompId.version as string;

    const repository = this.scope.legacyScope.objects;
    const baseVersionObject = await modelComponent.loadVersion(baseVersion, repository);
    const compareVersionObject = await modelComponent.loadVersion(compareVersion, repository);
    const diff: DiffResults = await diffBetweenVersionsObjects(
      modelComponent,
      baseVersionObject,
      compareVersionObject,
      baseVersion,
      compareVersion,
      this.scope.legacyScope,
      {}
    );

    const compareResult = {
      id: `${baseCompId}-${compareCompId}`,
      code: diff.filesDiff || [],
    };

    return compareResult;
  }

  static slots = [];
  static dependencies = [GraphqlAspect, ComponentAspect, ScopeAspect];
  static runtime = MainRuntime;
  static async provider([graphql, component, scope]: [GraphqlMain, ComponentMain, ScopeMain]) {
    const componentCompareMain = new ComponentCompareMain(component, scope);
    graphql.register(componentCompareSchema(componentCompareMain));
    return componentCompareMain;
  }
}

ComponentCompareAspect.addRuntime(ComponentCompareMain);

export default ComponentCompareMain;
