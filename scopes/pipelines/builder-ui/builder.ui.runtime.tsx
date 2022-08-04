import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { staticStorageUrl } from '@teambit/base-ui.constants.storage';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import type { FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { BuilderSection } from './builder.section';
import { BuilderUIAspect } from './builder-ui.aspect';

const isTsx = /\.tsx$/;

export type FileIconSlot = SlotRegistry<FileIconMatch[]>;

export class BuilderUI {
  constructor(
    /**
     * register an icon for a specific file type. pass icon and a match method/regexp
     */
    private fileIconSlot?: FileIconSlot
  ) {}

  registerEnvFileIcon(icons: FileIconMatch[]) {
    this.fileIconSlot?.register(icons);
    return this;
  }

  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;
  static slots = [Slot.withType<string>()];

  static async provider([component]: [ComponentUI], _, __, harmony: Harmony) {
    const ui = new BuilderUI();
    // overrides the default tsx react icon with the typescript icon
    ui.registerEnvFileIcon([
      (fileName) => (isTsx.test(fileName) ? `${staticStorageUrl}/file-icons/file_type_typescript.svg` : undefined),
    ]);

    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));

    const section = new BuilderSection(host);

    component.registerRoute(section.route);
    component.registerNavigation(section.navigationLink, section.order);

    return ui;
  }
}

BuilderUIAspect.addRuntime(BuilderUI);
