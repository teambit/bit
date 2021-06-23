import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';
import { Tmp } from '@teambit/legacy/dist/scope/repositories';
import { Lane, Version } from '@teambit/legacy/dist/scope/models';
import { BitId } from '@teambit/legacy-bit-id';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import { DEFAULT_LANE } from '@teambit/legacy/dist/constants';
import { diffBetweenVersionsObjects, DiffResults } from '@teambit/legacy/dist/consumer/component-ops/components-diff';

export class LaneDiffGenerator {
  private newComps: BitId[] = [];
  private compsWithDiff: DiffResults[] = [];
  private compsWithNoChanges: BitId[] = [];
  constructor(
    private workspace: Workspace,
    private scope: ScopeMain,
    private fromLane: Lane | null,
    private toLane: Lane
  ) {}
  async generate() {
    await Promise.all(
      this.toLane.components.map(async ({ id, head }) => {
        await this.componentDiff(id, head);
      })
    );
    return {
      newComps: this.newComps.map((id) => id.toString()),
      compsWithDiff: this.compsWithDiff,
      compsWithNoChanges: this.compsWithNoChanges.map((id) => id.toString()),
    };
  }
  private async componentDiff(id: BitId, toLaneHead: Ref) {
    const modelComponent = await this.scope.legacyScope.getModelComponent(id);
    const compFromLane = this.fromLane?.getComponentByName(id);
    const fromLaneHead = compFromLane ? compFromLane.head : modelComponent.head;
    if (!fromLaneHead) {
      this.newComps.push(id);
      return;
    }
    if (fromLaneHead.isEqual(toLaneHead)) {
      this.compsWithNoChanges.push(id);
      return;
    }
    const fromVersion = await fromLaneHead.load(this.scope.legacyScope.objects);
    const toVersion = await toLaneHead.load(this.scope.legacyScope.objects);
    const tmp = new Tmp(this.scope.legacyScope);
    const fromLaneStr = this.fromLane ? this.fromLane.name : DEFAULT_LANE;
    const diff = await diffBetweenVersionsObjects(
      modelComponent,
      tmp,
      fromVersion as Version,
      toVersion as Version,
      fromLaneStr,
      this.toLane.name,
      this.scope.legacyScope,
      { formatDepsAsTable: false }
    );
    this.compsWithDiff.push(diff);
  }
}
