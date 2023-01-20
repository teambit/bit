import React from 'react';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { CodeCompare } from '@teambit/code.ui.code-compare';
import { Harmony, SlotRegistry, Slot } from '@teambit/harmony';
import type { FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { staticStorageUrl } from '@teambit/base-ui.constants.storage';
import { CodePage } from '@teambit/code.ui.code-tab-page';
import { ComponentCompareUI, ComponentCompareAspect } from '@teambit/component-compare';
import { CodeCompareSection } from '@teambit/code.ui.code-compare-section';
import { initReviewManager } from '@teambit/code.ui.code-review.review-manager';
import { ReviewManagerProvider } from '@teambit/code.ui.code-review.context.review-manager-context';
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

  getCodePage = () => {
    return <CodePage fileIconSlot={this.fileIconSlot} host={this.host} />;
  };
  comments: any[] = [
    { lineNumber: 1 },
    { lineNumber: 6 },
    { lineNumber: 3, selection: { startColumn: 6, startLineNumber: 3, endColumn: 6, endLineNumber: 5 } },
  ];
  getCodeCompare = () => {
    return (
      <ReviewManagerProvider
        props={{
          init: initReviewManager,
          props: (props) => {
            console.log('🚀 ~ file: code.ui.runtime.tsx:43 ~ CodeUI ~ props', props);
            return {
              comments: this.comments,
            };
          },
          onDestroy: (props) => {
            console.log('🚀 ~ file: code.ui.runtime.tsx:50 ~ CodeUI ~ props', props);
          },
          onChange: (props) => {
            return (event) => {
              console.log(props, event);
              if (event.type === 'Add' || event.type === 'Select') {
                this.comments = this.comments.concat(event.comments);
                props.reviewManager?.refresh(this.comments);
              }
            };
          },
        }}
      >
        <CodeCompare fileIconSlot={this.fileIconSlot} />
      </ReviewManagerProvider>
    );
  };

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
    const section = new CodeSection(ui);

    // overrides the default tsx react icon with the typescript icon
    ui.registerEnvFileIcon([
      (fileName) => (isTsx.test(fileName) ? `${staticStorageUrl}/file-icons/file_type_typescript.svg` : undefined),
    ]);
    component.registerRoute([section.route]);
    component.registerWidget(section.navigationLink, section.order);
    const codeCompare = new CodeCompareSection(ui);
    componentCompare.registerNavigation(codeCompare);
    componentCompare.registerRoutes([codeCompare.route]);
    return ui;
  }
}

CodeAspect.addRuntime(CodeUI);
