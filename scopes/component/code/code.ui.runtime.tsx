import React from 'react';
import type { ComponentUI } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { CodeCompare, CodeCompareEditorProvider, type CodeCompareProps } from '@teambit/code.ui.code-compare';
import type { Harmony, SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { staticStorageUrl } from '@teambit/base-ui.constants.storage';
import type { CodePageProps } from '@teambit/code.ui.code-tab-page';
import { CodePage } from '@teambit/code.ui.code-tab-page';
import type { ComponentCompareUI } from '@teambit/component-compare';
import { ComponentCompareAspect } from '@teambit/component-compare';
import { CodeEditorProvider } from '@teambit/code.ui.code-editor';
import { CodeCompareSection } from '@teambit/code.ui.code-compare-section';
import { CodeAspect } from './code.aspect';
import { CodeSection } from './code.section';

const isTsx = /\.tsx$/;

export type FileIconSlot = SlotRegistry<FileIconMatch[]>;

/**
 * Component code tab aspect. Presents the code tab page and allows to control the code tab and register specific icons for each file type.
 *  @example CodeUI.registerEnvFileIcon([(fileName) => (/your-regexp/.test(fileName) ? 'your.icon.url' : undefined)])
 */
export class CodeUI {
  constructor(
    /**
     * register an icon for a specific file type. pass icon and a match method/regexp
     */
    private host: string,
    private fileIconSlot?: FileIconSlot
  ) {}

  getCodePage = (props?: Partial<CodePageProps>) => {
    return <CodePage {...(props || {})} fileIconSlot={this.fileIconSlot} host={this.host} />;
  };

  getCodeCompare = (props?: Partial<CodeCompareProps>) => {
    return (
      <CodeCompareEditorProvider>
        <CodeCompare {...(props || {})} fileIconSlot={this.fileIconSlot} />
      </CodeCompareEditorProvider>
    );
  };

  getCodeEditorProvider = () => CodeEditorProvider;
  getCodeDiffEditorProvider = () => CodeCompareEditorProvider;

  registerEnvFileIcon(icons: FileIconMatch[]) {
    this.fileIconSlot?.register(icons);
    return this;
  }

  static dependencies = [ComponentAspect, ComponentCompareAspect];

  static runtime = UIRuntime;

  static slots = [Slot.withType<string>()];

  static async provider(
    [component, componentCompare]: [ComponentUI, ComponentCompareUI],
    _,
    [fileIconSlot]: [FileIconSlot],
    harmony: Harmony
  ) {
    const { config } = harmony;
    const host = String(config.get('teambit.harmony/bit'));
    const ui = new CodeUI(host, fileIconSlot);
    const section = new CodeSection(ui, false);
    const pinnedSection = new CodeSection(ui, true);
    // overrides the default tsx react icon with the typescript icon
    ui.registerEnvFileIcon([
      (fileName) => (isTsx.test(fileName) ? `${staticStorageUrl}/file-icons/file_type_typescript.svg` : undefined),
    ]);
    component.registerRoute([section.route]);
    component.registerWidget(section.navigationLink, section.order);
    component.registerPinnedWidget(pinnedSection.navigationLink, pinnedSection.order);
    const codeCompare = new CodeCompareSection(ui);
    componentCompare.registerNavigation(codeCompare);
    componentCompare.registerRoutes([codeCompare.route]);
    return ui;
  }
}

CodeAspect.addRuntime(CodeUI);
