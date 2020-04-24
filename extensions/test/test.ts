import { Workspace } from '@bit/bit.core.workspace';
import ConsumerComponent from 'bit-bin/consumer/component';
import { BitId } from 'bit-bin/bit-id';
import { Component } from '@bit/bit.core.component';
import { Capsule } from '@bit/bit.core.isolator/capsule';
import { Compile } from '@bit/bit.core.compile';
import ComponentsList from 'bit-bin/consumer/component/components-list';

export type ComponentsAndCapsules = {
  consumerComponent: ConsumerComponent;
  component: Component;
  capsule: Capsule;
};

export class Test {
  constructor(private compile: Compile, private workspace: Workspace) {}

  async test(componentsIds: string[], { all, verbose }: { all: boolean; verbose: boolean }) {
    const bitIds = await this.getBitIds(componentsIds, all);
    const bitIdsStr = bitIds.map(i => i.toString());
    const compileResults = await this.compile.legacyCompile(bitIdsStr, { verbose, noCache: false });
    const componentsAndCapsules = compileResults.components;
    componentsAndCapsules.forEach(c => {
      c.consumerComponent._capsuleDir = c.capsule.wrkDir;
    });
    const consumerComponents = componentsAndCapsules.map(c => c.consumerComponent);
    const testResults = await this.workspace.consumer.scope.testMultiple({
      components: consumerComponents,
      consumer: this.workspace.consumer,
      verbose
    });
    this.workspace.consumer.onDestroy();
    return testResults;
  }

  private async getBitIds(componentsIds: string[], includeUnmodified: boolean): Promise<BitId[]> {
    if (componentsIds.length) {
      return componentsIds.map(idStr => this.workspace.consumer.getParsedId(idStr));
    }
    if (includeUnmodified) {
      return this.workspace.consumer.bitMap.getAuthoredAndImportedBitIds();
    }
    const componentsList = new ComponentsList(this.workspace.consumer);
    const components = await componentsList.newModifiedAndAutoTaggedComponents();
    return components.map(c => c.id);
  }
}
