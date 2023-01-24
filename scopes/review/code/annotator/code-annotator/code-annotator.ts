import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import { isEqual, uniqBy } from 'lodash';
import compact from 'lodash.compact';
import {
  BaseStyleSettings,
  CodeSelection,
  hasDefaultIconRenderer,
  InternalReviewManagerSettings,
  AnnotateEventType,
  styleDeclarationToString,
  OnChange,
  AnnotateItem,
  ReviewManagerSettings,
  StyleSettings,
  ICodeAnnotator,
  InitCodeAnnotator,
} from '../models';
import { defaultStyles } from '../styles';

class CodeAnnotator implements ICodeAnnotator {
  static defaultCodeSelectionOverrideKey(codeSelection: CodeSelection) {
    return `${codeSelection.startLineNumber}_${codeSelection.endLineNumber}-${codeSelection.startColumn}_${codeSelection.endColumn}`;
  }

  private currentUser: string;
  private editor: monacoEditor.editor.IStandaloneCodeEditor;
  private editorConfig: monacoEditor.editor.IEditorOptions;
  private addReviewDecoration?: string;
  private lineReviewDecorations: string[];
  private codeSelectionDecorations: string[];
  private annotations: AnnotateItem[];
  private settings: InternalReviewManagerSettings;
  private verbose?: boolean;
  private currentLine?: number;
  private currentSelection?: CodeSelection;
  private lastEvent?: AnnotateEventType;
  private disposables: monacoEditor.IDisposable[];
  private defaultStyles = defaultStyles;

  private mapToBaseStyles(defaultSettings: BaseStyleSettings, settings?: StyleSettings): BaseStyleSettings {
    let updatedSettings = defaultSettings;

    if (!settings) return updatedSettings;
    if (hasDefaultIconRenderer(settings)) {
      updatedSettings.styles.backgroundImage = `url(${settings.iconUrl})`;
    } else {
      updatedSettings = settings;
    }
    return updatedSettings;
  }

  private createCustomCssClasses(hardRefresh = false) {
    if (hardRefresh || !document.getElementById(this.defaultStyles.id)) {
      const style = document.createElement('style');
      style.id = this.defaultStyles.id;
      style.type = 'text/css';

      const defaultAddStyles = styleDeclarationToString(this.settings.addReviewStyles.styles);
      const defaultLineStyles = styleDeclarationToString(this.settings.lineReviewStyles.styles);
      const defaultSelectionStyles = styleDeclarationToString(this.settings.codeSelectionReviewStyles.styles);

      style.innerHTML = `
      .${this.settings.addReviewStyles.className} {${defaultAddStyles}}
      .${this.settings.lineReviewStyles.className} {${defaultLineStyles}}
      .${this.settings.codeSelectionReviewStyles.className} {${defaultSelectionStyles}}
      ${this.createCustomOverrideCssClasses(this.settings.lineReviewStyles.overrides || {})}
      ${this.createCustomOverrideCssClasses(this.settings.codeSelectionReviewStyles.overrides || {})}
      .margin {
        width: 64px !important;
      }
      .monaco-scrollable-element {
        left: 64px !important;
      }
      .margin-view-overlays {
        width: 64px !important;
      }
      .codicon-diff-insert:before {
        content: none !important;
      }
      .codicon-diff-remove:before {
        content: none !important;
      }
      `;

      document.getElementsByTagName('head')[0].appendChild(style);
    }
  }

  private createCustomOverrideCssClasses(overrides: Record<number | string, BaseStyleSettings>): string {
    return Object.entries(overrides).reduce((accum, [key, value]) => {
      return accum.concat(`\n.${key}_${value.className} {${styleDeclarationToString(value)}}`);
    }, '');
  }

  private handleMouseMove(event: monacoEditor.editor.IEditorMouseEvent) {
    if (event.target && event.target.position && event.target.position.lineNumber) {
      this.currentLine = event.target.position.lineNumber;
      this.renderAddReviewDecoration(event.target.position.lineNumber);
    }
  }

  private handleMouseUp(event: monacoEditor.editor.IEditorMouseEvent) {
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log('🚀 ~ file: review-manager.ts:324 ~ ReviewManager ~ handleMouseUp ~ handleMouseUp \n');
      // eslint-disable-next-line no-console
      console.dir(this);
    }
    const isSelectionAndLineSame = this.currentLine === this.currentSelection?.startLineNumber;
    if (!isSelectionAndLineSame) {
      this.currentLine = this.currentSelection?.startLineNumber;
      this.renderAddReviewDecoration(this.currentLine);
    }
    const annotations = new Array<AnnotateItem>(...this.annotations.filter((c) => c.lineNumber === this.currentLine), {
      lineNumber: this.currentLine,
      selection: this.currentSelection,
    });
    this.lastEvent && this.onChange({ type: this.lastEvent, annotations, event: event.event });
  }

  private handleMouseDown(event: monacoEditor.editor.IEditorMouseEvent) {
    this.lastEvent = undefined;

    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log('🚀 ~ file: review-manager.ts:486 ~ handleMouseDown ~ event\n');
      // eslint-disable-next-line no-console
      console.dir(event);
    }
    // Not ideal - but couldn't figure out a different way to identify the glyph event
    if (!event.target.element?.className) return;
    if (!this.currentLine && event.target.position) {
      this.currentLine = event.target.position.lineNumber;
    }

    if (event.target.element.className.indexOf(this.settings.lineReviewStyles.className) > -1) {
      // eslint-disable-next-line no-console
      if (this.verbose) console.log('\n clicking on line comment');

      this.currentLine &&
        this.editor.setSelection(new monacoEditor.Selection(this.currentLine, 0, this.currentLine, 0));

      this.lastEvent = AnnotateEventType.UpdateEvent;
    }
    if (!this.currentLine && event.target.position) {
      this.currentLine = event.target.position.lineNumber;
    }

    if (event.target.element.className.indexOf('line-numbers') > -1) {
      // eslint-disable-next-line no-console
      if (this.verbose) console.log('\n clicking on add review');

      this.currentLine &&
        this.editor.setSelection(new monacoEditor.Selection(this.currentLine, 0, this.currentLine, 0));

      this.lastEvent = AnnotateEventType.AddEvent;
    }
  }

  private handleChangeCursorSelection(event: monacoEditor.editor.ICursorSelectionChangedEvent) {
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log(
        '🚀 ~ file: review-manager.ts:317 ~ ReviewManager ~ handleChangeCursorSelection ~ handleChangeCursorSelection \n'
      );
      // eslint-disable-next-line no-console
      console.dir(event);
    }
    const { selection } = event;
    if (!isEqual(selection, this.currentSelection)) {
      this.editor.setSelection(selection);
      this.currentSelection = selection;
      this.lastEvent = AnnotateEventType.SelectionEvent;
    }
  }

  private renderAddReviewDecoration(lineNumber?: number) {
    const decorations: monacoEditor.editor.IModelDeltaDecoration[] = lineNumber
      ? [
          {
            range: new monacoEditor.Range(lineNumber, 0, lineNumber, 0),
            options: {
              marginClassName: this.settings.addReviewStyles.className,
              zIndex: 100,
            },
          },
        ]
      : [];
    this.addReviewDecoration = this.editor.deltaDecorations(
      (this.addReviewDecoration && [this.addReviewDecoration]) || [],
      decorations
    )[0];
  }

  onChange: OnChange;

  constructor(
    editor: monacoEditor.editor.IStandaloneCodeEditor,
    currentUser: string,
    onChange: OnChange,
    annotations: AnnotateItem[],
    settings?: ReviewManagerSettings,
    verbose?: boolean
  ) {
    this.currentUser = currentUser;
    this.editor = editor;
    this.onChange = onChange;
    this.lineReviewDecorations = [];
    this.codeSelectionDecorations = [];
    this.disposables = [];
    this.verbose = verbose;
    this.editorConfig = this.editor.getRawOptions?.() ?? {};
    this.disposables.push(
      this.editor.onDidChangeConfiguration(() => (this.editorConfig = this.editor.getRawOptions()))
    );
    this.disposables.push(this.editor.onMouseDown(this.handleMouseDown.bind(this)));
    this.disposables.push(this.editor.onMouseUp(this.handleMouseUp.bind(this)));
    this.disposables.push(this.editor.onMouseMove(this.handleMouseMove.bind(this)));
    this.disposables.push(this.editor.onDidChangeCursorSelection(this.handleChangeCursorSelection.bind(this)));
    // apply settings first and create custom css classes
    this.applySettingsAndLoadAnnotations(annotations, settings);
  }

  applySettingsAndLoadAnnotations(
    annotations: AnnotateItem[],
    settings?: ReviewManagerSettings,
    hardRefresh?: boolean
  ) {
    let updatedSettings: InternalReviewManagerSettings = this.defaultStyles.styles;

    if (settings) {
      updatedSettings = {
        addReviewStyles: this.mapToBaseStyles(this.defaultStyles.styles.addReviewStyles, settings.addReviewStyles),
        lineReviewStyles: this.mapToBaseStyles(this.defaultStyles.styles.lineReviewStyles, settings.lineReviewStyles),
        codeSelectionReviewStyles: {
          ...this.defaultStyles.styles.codeSelectionReviewStyles,
          ...(this.settings?.codeSelectionReviewStyles || {}),
        },
      };
    }

    const hasSettingsUpdated = !isEqual(this.settings, updatedSettings);

    this.annotations = annotations;

    if (hardRefresh || hasSettingsUpdated) {
      this.settings = hasSettingsUpdated ? updatedSettings : this.settings;
      this.createCustomCssClasses(hasSettingsUpdated);
      this.load(this.annotations);
    }
  }

  refresh(annotations?: AnnotateItem[], settings?: ReviewManagerSettings) {
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log('🚀 ~ file: review-manager.ts:140 ~ ReviewManager ~ refresh ~ refresh');
      // eslint-disable-next-line no-console
      console.dir(this);
      // eslint-disable-next-line no-console
      console.dir(annotations);
      // eslint-disable-next-line no-console
      console.dir(settings);
    }
    this.applySettingsAndLoadAnnotations(annotations || this.annotations, settings, true);
    this.editor.render();
  }

  dispose() {
    const decorations = ((this.addReviewDecoration && [this.addReviewDecoration]) || [])
      .concat(this.lineReviewDecorations)
      .concat(this.codeSelectionDecorations);

    this.editor.deltaDecorations(decorations, []);
    this.addReviewDecoration = undefined;
    this.lineReviewDecorations = [];
    this.codeSelectionDecorations = [];
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  load(annotations: AnnotateItem[]): void {
    this.annotations = annotations;
    const [, commentsWithSelection] = annotations.reduce(
      (acc, curr) => {
        if (curr.selection) {
          acc[1].push(curr);
        } else {
          acc[0].push(curr);
        }
        return acc;
      },
      [new Array<AnnotateItem>(), new Array<AnnotateItem>()]
    );
    const uniqueLinesToAnnotate = compact(uniqBy(annotations, (obj) => obj.lineNumber).map((c) => c.lineNumber));
    this.renderLineReviewDecoration(uniqueLinesToAnnotate);
    this.renderCodeSelectionReviewDecoration(commentsWithSelection.map((c) => c.selection as CodeSelection));
  }

  renderLineReviewDecoration(lineNumbers: number[]) {
    const decorations: monacoEditor.editor.IModelDeltaDecoration[] = lineNumbers.map((lineNumber) => {
      const className =
        this.settings.lineReviewStyles.overrides?.[lineNumber].className || this.settings.lineReviewStyles.className;

      const decoration: monacoEditor.editor.IModelDeltaDecoration = {
        range: new monacoEditor.Range(lineNumber, 0, lineNumber, 0),
        options: {
          linesDecorationsClassName: className,
          zIndex: 100,
        },
      };
      return decoration;
    });

    this.lineReviewDecorations = this.editor.deltaDecorations(this.lineReviewDecorations, decorations);
  }

  renderCodeSelectionReviewDecoration(codeSelections: CodeSelection[]) {
    const decorations: monacoEditor.editor.IModelDeltaDecoration[] = codeSelections.map((codeSelection) => {
      const getKey =
        this.settings.codeSelectionReviewStyles.overridesKey || CodeAnnotator.defaultCodeSelectionOverrideKey;

      const className =
        this.settings.codeSelectionReviewStyles.overrides?.[getKey(codeSelection)].className ||
        this.settings.codeSelectionReviewStyles.className;

      const decoration: monacoEditor.editor.IModelDeltaDecoration = {
        range: new monacoEditor.Range(
          codeSelection.startLineNumber,
          codeSelection.startColumn,
          codeSelection.endLineNumber,
          codeSelection.endColumn
        ),
        options: {
          inlineClassName: className,
          zIndex: 100,
        },
      };
      return decoration;
    });

    this.codeSelectionDecorations = this.editor.deltaDecorations(this.codeSelectionDecorations, decorations);
  }
}

export const initCodeAnnotator: InitCodeAnnotator = ({
  editor,
  currentUser,
  onChange,
  annotations,
  settings,
  verbose,
}) => {
  return new CodeAnnotator(editor, currentUser || 'default', onChange, annotations, settings, verbose);
};
