import path from 'path';
import fs from 'fs-extra';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import CapsuleList from './capsule-list';
import ConsumerComponent from '../../consumer/component';

export async function symlinkCapsulesToWorkspace(
  capsuleList: CapsuleList,
  components: ConsumerComponent[],
  projectPath: string
) {
  await Promise.all(
    capsuleList.map(async c => {
      const component = components.find(comp => comp.id.isEqualWithoutScopeAndVersion(c.id));
      if (!component) throw new Error(`symlinkCapsulesToWorkspace, component is missing for ${c.id.toString()}`);
      const componentPackageName = componentIdToPackageName(c.id, component.bindingPrefix, component.defaultScope);
      const linkPath = path.join(projectPath, 'node_modules', componentPackageName);
      await fs.remove(linkPath); // in case a symlink already generated or when linking a component, when a component has been moved
      await fs.ensureDir(path.dirname(linkPath));
      await fs.symlink(c.value.wrkDir, linkPath);
    })
  );
}
