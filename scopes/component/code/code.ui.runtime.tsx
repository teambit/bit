import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import React from 'react';
import { SlotRegistry, Slot } from '@teambit/harmony';
import type { FileIconMatch } from '@teambit/code.utils.get-file-icon';
import { staticStorageUrl } from '@teambit/base-ui.constants.storage';
import { CodeAspect } from './code.aspect';
import { CodeSection } from './code.section';
import { CodePage } from './ui/code-tab-page';

const isTsx = /\.tsx$/;

export type FileIconSlot = SlotRegistry<FileIconMatch[]>;
export class CodeUI {
  constructor(
    /**
     * register an icon for a specific file type. pass icon and a match method/regexp
     */
    private fileIconSlot?: FileIconSlot
  ) {}
  getCodePage = () => {
    return <CodePage fileIconSlot={this.fileIconSlot} />;
  };
  registerEnvFileIcon(icons: FileIconMatch[]) {
    this.fileIconSlot?.register(icons);
    return this;
  }
  static dependencies = [ComponentAspect];

  static runtime = UIRuntime;

  static slots = [Slot.withType<string>()];

  static async provider([component]: [ComponentUI], config, [fileIconSlot]: [FileIconSlot]) {
    const ui = new CodeUI(fileIconSlot);
    const section = new CodeSection(ui);

    // overrides the default tsx react icon with the typescript icon
    ui.registerEnvFileIcon([
      (fileName) => (isTsx.test(fileName) ? `${staticStorageUrl}/file-icons/file_type_typescript.svg` : undefined),
    ]);
    component.registerRoute(section.route);
    component.registerWidget(section.navigationLink, section.order);
    return ui;
  }
}

CodeAspect.addRuntime(CodeUI);
