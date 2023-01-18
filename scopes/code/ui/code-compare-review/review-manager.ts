import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import { isEqual, uniq, uniqBy } from 'lodash';
import compact from 'lodash.compact';
import {
  BaseStyleSettings,
  CodeSelection,
  hasDefaultIconRenderer,
  InternalReviewManagerSettings,
  OnChange,
  ReviewComment,
  ReviewManagerEventType,
  ReviewManagerSettings,
  styleDeclarationToString,
  StyleSettings,
} from './models';

export class ReviewManager {
  currentUser: string;
  editor: monacoEditor.editor.IStandaloneCodeEditor;
  editorConfig: monacoEditor.editor.IEditorOptions;
  activeComment?: ReviewComment;
  onChange: OnChange;
  addReviewDecorations: string[];
  lineReviewDecorations: string[];
  codeSelectionDecorations: string[];
  comments: ReviewComment[];
  settings: InternalReviewManagerSettings;
  verbose?: boolean;
  currentLine?: number;
  currentSelection?: CodeSelection;
  lastEvent: ReviewManagerEventType;
  // currentCommentDecorations: string[];

  private CUSTOM_STYLE_ID = 'monaco_review_manager_styles';
  private ICONS = {
    ADD_REVIEW: 'https://static.bit.dev/bit-icons/plus.svg',
    LINE_REVIEW: 'https://static.bit.dev/bit-icons/collection.svg',
  };
  private DEFAULT_SETTINGS: InternalReviewManagerSettings = {
    addReviewStyles: {
      className: 'default_add_review',
      styles: {
        backgroundImage: `url(${this.ICONS.ADD_REVIEW})`,
        backgroundRepeat: 'no-repeat',
        height: '16px',
        width: '16px',
        backgroundSize: '16px',
        marginLeft: '4px',
        cursor: 'pointer',
      },
    },
    lineReviewStyles: {
      className: 'default_line_review',
      styles: {
        backgroundImage: `url(${this.ICONS.LINE_REVIEW})`,
        backgroundRepeat: 'no-repeat',
        height: '16px',
        width: '16px',
        backgroundSize: '16px',
        marginLeft: '4px',
        cursor: 'pointer',
      },
    },
    codeSelectionReviewStyles: {
      className: 'default_code_selection',
      styles: {
        color: 'red',
        textDecoration: 'underline',
        fontWeight: '500',
      },
    },
  };

  constructor(
    editor: monacoEditor.editor.IStandaloneCodeEditor,
    currentUser: string,
    onChange: OnChange,
    comments: ReviewComment[],
    settings?: ReviewManagerSettings,
    verbose?: boolean
  ) {
    this.currentUser = currentUser;
    this.editor = editor;
    this.activeComment = undefined;
    this.onChange = onChange;
    this.addReviewDecorations = [];
    this.lineReviewDecorations = [];
    this.codeSelectionDecorations = [];
    // this.currentCommentDecorations = [];
    // this.currentLineDecorationLineNumber = undefined;
    this.verbose = verbose;
    this.editorConfig = this.editor.getRawOptions?.() ?? {};
    this.editor.onDidChangeConfiguration(() => (this.editorConfig = this.editor.getRawOptions()));
    this.editor.onMouseDown(this.handleMouseDown.bind(this));
    this.editor.onMouseUp(this.handleMouseUp.bind(this));
    this.editor.onMouseMove(this.handleMouseMove.bind(this));
    this.editor.onDidChangeCursorSelection(this.handleChangeCursorSelection.bind(this));
    // apply settings first and create custom css classes
    this.applySettingsAndLoadComments(comments, settings);
  }

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

  applySettingsAndLoadComments(comments: ReviewComment[], settings?: ReviewManagerSettings, hardRefresh?: boolean) {
    let updatedSettings: InternalReviewManagerSettings = this.DEFAULT_SETTINGS;

    if (settings) {
      updatedSettings = {
        addReviewStyles: this.mapToBaseStyles(this.DEFAULT_SETTINGS.addReviewStyles, settings.addReviewStyles),
        lineReviewStyles: this.mapToBaseStyles(this.DEFAULT_SETTINGS.lineReviewStyles, settings.lineReviewStyles),
        codeSelectionReviewStyles: {
          ...this.DEFAULT_SETTINGS.codeSelectionReviewStyles,
          ...(this.settings?.codeSelectionReviewStyles || {}),
        },
      };
    }

    const hasSettingsUpdated = !isEqual(this.settings, updatedSettings);
    const hasCommentsUpdated = !isEqual(this.comments, comments);

    if (hardRefresh || hasSettingsUpdated || hasCommentsUpdated) {
      this.comments = hasCommentsUpdated ? comments : this.comments;
      this.settings = hasSettingsUpdated ? updatedSettings : this.settings;
      this.createCustomCssClasses(hasSettingsUpdated);
      this.load(this.comments);
    }
  }

  refresh(comments?: ReviewComment[], settings?: ReviewManagerSettings) {
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log('🚀 ~ file: review-manager.ts:140 ~ ReviewManager ~ refresh ~ refresh');
      // eslint-disable-next-line no-console
      console.dir(this);
      // eslint-disable-next-line no-console
      console.dir(comments);
      // eslint-disable-next-line no-console
      console.dir(settings);
    }
    this.applySettingsAndLoadComments(comments || this.comments, settings, true);
    this.editor.render();
  }

  // @todo fix this
  dispose() {
    this.editor.onMouseDown(() => {});
    this.editor.onMouseMove(() => {});
    this.editor.render(true);
  }

  createCustomCssClasses(hardRefresh = false) {
    if (hardRefresh || !document.getElementById(this.CUSTOM_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = this.CUSTOM_STYLE_ID;
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

  createCustomOverrideCssClasses(overrides: Record<number | string, BaseStyleSettings>): string {
    return Object.entries(overrides).reduce((accum, [key, value]) => {
      return accum.concat(`\n.${key}_${value.className} {${styleDeclarationToString(value)}}`);
    }, '');
  }

  setReadOnlyMode() {
    this.renderAddReviewDecoration();
  }

  load(comments: ReviewComment[]): void {
    this.comments = comments;
    const [, commentsWithSelection] = comments.reduce(
      (accum, curr) => {
        if (curr.selection) {
          accum[1].push(curr);
        } else {
          accum[0].push(curr);
        }
        return accum;
      },
      [new Array<ReviewComment>(), new Array<ReviewComment>()]
    );
    const uniqueLinesToAnnotate = compact(uniqBy(comments, (obj) => obj.lineNumber).map((c) => c.lineNumber));
    this.renderLineReviewDecoration(uniqueLinesToAnnotate);
    this.renderCodeSelectionReviewDecoration(commentsWithSelection.map((c) => c.selection as CodeSelection));
  }

  handleMouseMove(ev: monacoEditor.editor.IEditorMouseEvent) {
    if (ev.target && ev.target.position && ev.target.position.lineNumber) {
      this.currentLine = ev.target.position.lineNumber;
      // console.log('🚀 ~ file: review-manager.ts:242 ~ ReviewManager ~ handleMouseMove ~ handleMouseMove \n');
      // console.dir(ev);
      this.renderAddReviewDecoration(ev.target.position.lineNumber);
    }
  }

  renderAddReviewDecoration(lineNumber?: number) {
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
    this.addReviewDecorations = uniq(
      this.addReviewDecorations.concat(this.editor.deltaDecorations(this.addReviewDecorations, decorations))
    );
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
        this.settings.codeSelectionReviewStyles.overridesKey || ReviewManager.defaultCodeSelectionOverridesKey;

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

  static defaultCodeSelectionOverridesKey(codeSelection: CodeSelection) {
    return `${codeSelection.startLineNumber}_${codeSelection.endLineNumber}-${codeSelection.startColumn}_${codeSelection.endColumn}`;
  }

  handleChangeCursorSelection(ev: monacoEditor.editor.ICursorSelectionChangedEvent) {
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log(
        '🚀 ~ file: review-manager.ts:317 ~ ReviewManager ~ handleChangeCursorSelection ~ handleChangeCursorSelection \n'
      );
      // eslint-disable-next-line no-console
      console.dir(ev);
    }
    const { selection } = ev;
    if (!isEqual(selection, this.currentSelection)) {
      this.editor.setSelection(selection);
      this.currentSelection = selection;
    }
  }

  handleMouseUp() {
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
    const comments = new Array<ReviewComment>(...this.comments.filter((c) => c.lineNumber === this.currentLine), {
      lineNumber: this.currentLine,
      selection: this.currentSelection,
    });
    this.onChange({ type: this.lastEvent, comments });
  }

  handleMouseDown(ev: monacoEditor.editor.IEditorMouseEvent) {
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.log('🚀 ~ file: review-manager.ts:486 ~ handleMouseDown ~ ev\n');
      // eslint-disable-next-line no-console
      console.dir(ev);
    }
    // Not ideal - but couldn't figure out a different way to identify the glyph event
    if (!ev.target.element?.className) return;
    if (!this.currentLine && ev.target.position) {
      this.currentLine = ev.target.position.lineNumber;
    }

    if (ev.target.element.className.indexOf(this.settings.lineReviewStyles.className) > -1) {
      // eslint-disable-next-line no-console
      if (this.verbose) console.log('\n clicking on line comment');

      this.currentLine &&
        this.editor.setSelection(new monacoEditor.Selection(this.currentLine, 0, this.currentLine, 0));

      this.lastEvent = 2;
    }
    if (!this.currentLine && ev.target.position) {
      this.currentLine = ev.target.position.lineNumber;
    }

    if (ev.target.element.className.indexOf('line-numbers') > -1) {
      // eslint-disable-next-line no-console
      if (this.verbose) console.log('\n clicking on add review');

      this.currentLine &&
        this.editor.setSelection(new monacoEditor.Selection(this.currentLine, 0, this.currentLine, 0));

      this.lastEvent = 1;
    }
  }
}
