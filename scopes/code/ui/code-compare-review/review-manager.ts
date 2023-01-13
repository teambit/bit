import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';
import * as uuid from 'uuid';
import { ReviewCommentEvent } from './events';
import { reduceComments, commentReducer } from './events-comments-reducers';
import {
  CodeSelection,
  ReviewComment,
  ReviewCommentRenderState,
  ReviewCommentState,
  ReviewCommentStatus,
  ReviewCommentStore,
} from './models';
import {
  OnActionsChanged,
  EditorElements,
  InlineToolbarElements,
  RenderStoreItem,
  defaultReviewManagerConfig,
  CONTROL_ATTR_NAME,
  POSITION_BELOW,
  ReviewCommentIterItem,
  ReviewManagerConfigPrivate,
  ReviewManagerConfig,
} from './review-manager.models';

export enum EditorMode {
  insertComment = 1,
  replyComment = 2,
  editComment = 3,
  toolbar = 4,
}

export class ReviewManager {
  currentUser: string;
  editor: monacoEditor.editor.IStandaloneCodeEditor;
  editorConfig: monacoEditor.editor.IEditorOptions;
  events: ReviewCommentEvent[];
  store: ReviewCommentStore;
  activeComment?: ReviewComment;
  widgetInlineToolbar?: monacoEditor.editor.IContentWidget;
  widgetInlineCommentEditor?: monacoEditor.editor.IContentWidget;
  onChange: OnActionsChanged;
  editorMode: EditorMode;
  config: ReviewManagerConfigPrivate;
  currentLineDecorations: string[];
  currentCommentDecorations: string[];
  currentLineDecorationLineNumber?: number;

  editorElements: EditorElements;
  inlineToolbarElements: InlineToolbarElements;
  verbose?: boolean;
  canAddCondition: monacoEditor.editor.IContextKey<boolean>;
  canCancelCondition: monacoEditor.editor.IContextKey<boolean>;
  renderStore: Record<string, RenderStoreItem>;

  constructor(
    editor: monacoEditor.editor.IStandaloneCodeEditor,
    currentUser: string,
    onChange: OnActionsChanged,
    config?: ReviewManagerConfig,
    verbose?: boolean
  ) {
    this.currentUser = currentUser;
    this.editor = editor;
    this.activeComment = undefined; // TODO - consider moving onto the store
    this.widgetInlineToolbar = undefined;
    this.widgetInlineCommentEditor = undefined;
    this.onChange = onChange;
    this.editorMode = EditorMode.toolbar;
    this.config = { ...defaultReviewManagerConfig, ...(config || {}) };
    this.currentLineDecorations = [];
    this.currentCommentDecorations = [];
    this.currentLineDecorationLineNumber = undefined;
    this.events = [];
    this.store = { comments: {} }; // viewZoneIdsToDelete: [] };
    this.renderStore = {};

    this.verbose = verbose;
    this.editorConfig = this.editor.getRawOptions?.() ?? {};
    this.editor.onDidChangeConfiguration(() => (this.editorConfig = this.editor.getRawOptions()));
    this.editor.onMouseDown(this.handleMouseDown.bind(this));
    this.canAddCondition = this.editor.createContextKey('add-context-key', !this.config.readOnly);
    this.canCancelCondition = this.editor.createContextKey('cancel-context-key', false);
    this.inlineToolbarElements = this.createInlineToolbarWidget();
    this.editorElements = this.createInlineEditorWidget();
    this.addActions();

    if (this.config.showAddCommentGlyph) {
      this.editor.onMouseMove(this.handleMouseMove.bind(this));
    }

    this.createCustomCssClasses();
  }

  createCustomCssClasses() {
    const id = 'monaco_review_custom_styles';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = 'monaco_review_custom_styles';
      style.type = 'text/css';
      style.innerHTML = `
  
      .activeLineMarginClass {
        z-index:10;
        background-image: url("data:image/svg+xml;base64,Cjxzdmcgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KIDxnPgogIDx0aXRsZT5MYXllciAxPC90aXRsZT4KICA8ZyBpZD0ic3ZnXzIiPgogICA8cGF0aCBmaWxsPSJkYXJrb3JhbmdlIiBkPSJtMTIuNDAxMzUsMTUuMjE0NzlsLTkuMjY4MjIsMHEtMS4xNTU3NSwwIC0xLjk2Njk5LC0wLjcyNzJ0LTAuODExMjUsLTEuNzYzMjFsMCwtOS45NjE2NXEwLC0xLjAzNjAxIDAuODExMjUsLTEuNzYzMjF0MS45NjY5OSwtMC43MjcybDkuMjY4MjIsMHExLjE1NTc0LDAgMS45NjY5OSwwLjcyNzJ0MC44MTEyNSwxLjc2MzIxbDAsOS45NjE2NXEwLDEuMDM2MDEgLTAuODExMjUsMS43NjMyMXQtMS45NjY5OSwwLjcyNzJ6bS05LjI2ODIyLC0xMy4yODg4M3EtMC4zNzc4NCwwIC0wLjY1NTY2LDAuMjQ5MDR0LTAuMjc3ODMsMC41ODc3M2wwLDkuOTYxNjVxMCwwLjMzODcgMC4yNzc4MywwLjU4Nzc0dDAuNjU1NjYsMC4yNDkwNGw5LjI2ODIyLDBxMC4zNzc4NCwwIDAuNjQ0NTUsLTAuMjQ5MDR0MC4yNjY3MSwtMC41ODc3NGwwLC05Ljk2MTY1cTAsLTAuMzM4NjkgLTAuMjY2NzEsLTAuNTg3NzN0LTAuNjQ0NTUsLTAuMjQ5MDRsLTkuMjY4MjIsMHptOC4zMzQ3Myw0Ljk4MDgybC03LjQwMTI0LDBxLTAuNDY2NzQsMCAtMC40NjY3NCwtMC4zOTg0N3EwLC0wLjE3OTMxIDAuMTMzMzUsLTAuMjk4ODV0MC4zMzMzOSwtMC4xMTk1NGw3LjQwMTI0LDBxMC4yMDAwMywwIDAuMzMzMzksMC4xMTk1NHQwLjEzMzM1LDAuMjk4ODVxMCwwLjM5ODQ3IC0wLjQ2Njc0LDAuMzk4NDd6bTAsLTIuNDkwNDFsLTcuNDAxMjQsMHEtMC4yMDAwMywwIC0wLjMzMzM5LC0wLjExOTU0dC0wLjEzMzM1LC0wLjI5ODg1cTAsLTAuMzk4NDcgMC40NjY3NCwtMC4zOTg0N2w3LjQwMTI0LDBxMC40NjY3NCwwIDAuNDY2NzQsMC4zOTg0N3EwLDAuMTc5MzEgLTAuMTMzMzUsMC4yOTg4NXQtMC4zMzMzOSwwLjExOTU0em0wLDQuOTgwODJsLTcuNDAxMjQsMHEtMC4yMDAwMywwIC0wLjMzMzM5LC0wLjExOTU0dC0wLjEzMzM1LC0wLjI5ODg1cTAsLTAuMzk4NDYgMC40NjY3NCwtMC4zOTg0Nmw3LjQwMTI0LDBxMC40NjY3NCwwIDAuNDY2NzQsMC4zOTg0NnEwLDAuMTc5MzEgLTAuMTMzMzUsMC4yOTg4NXQtMC4zMzMzOSwwLjExOTU0em0wLDIuNDkwNDFsLTcuNDAxMjQsMHEtMC40NjY3NCwwIC0wLjQ2Njc0LC0wLjM5ODQ2cTAsLTAuMTc5MzEgMC4xMzMzNSwtMC4yOTg4NXQwLjMzMzM5LC0wLjExOTU0bDcuNDAxMjQsMHEwLjIwMDAzLDAgMC4zMzMzOSwwLjExOTU0dDAuMTMzMzUsMC4yOTg4NXEwLDAuMzk4NDYgLTAuNDY2NzQsMC4zOTg0NnoiIGlkPSJzdmdfMSIgc3Ryb2tlPSJudWxsIi8+CiAgPC9nPgogPC9nPgo8L3N2Zz4=");
      }`;

      /*
    
    svg = `
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
     <g>
      <title>Layer 1</title>
      <g id="svg_2">
       <path fill="#re d="m12.40135,15.21479l-9.26822,0q-1.15575,0 -1.96699,-0.7272t-0.81125,-1.76321l0,-9.96165q0,-1.03601 0.81125,-1.76321t1.96699,-0.7272l9.26822,0q1.15574,0 1.96699,0.7272t0.81125,1.76321l0,9.96165q0,1.03601 -0.81125,1.76321t-1.96699,0.7272zm-9.26822,-13.28883q-0.37784,0 -0.65566,0.24904t-0.27783,0.58773l0,9.96165q0,0.3387 0.27783,0.58774t0.65566,0.24904l9.26822,0q0.37784,0 0.64455,-0.24904t0.26671,-0.58774l0,-9.96165q0,-0.33869 -0.26671,-0.58773t-0.64455,-0.24904l-9.26822,0zm8.33473,4.98082l-7.40124,0q-0.46674,0 -0.46674,-0.39847q0,-0.17931 0.13335,-0.29885t0.33339,-0.11954l7.40124,0q0.20003,0 0.33339,0.11954t0.13335,0.29885q0,0.39847 -0.46674,0.39847zm0,-2.49041l-7.40124,0q-0.20003,0 -0.33339,-0.11954t-0.13335,-0.29885q0,-0.39847 0.46674,-0.39847l7.40124,0q0.46674,0 0.46674,0.39847q0,0.17931 -0.13335,0.29885t-0.33339,0.11954zm0,4.98082l-7.40124,0q-0.20003,0 -0.33339,-0.11954t-0.13335,-0.29885q0,-0.39846 0.46674,-0.39846l7.40124,0q0.46674,0 0.46674,0.39846q0,0.17931 -0.13335,0.29885t-0.33339,0.11954zm0,2.49041l-7.40124,0q-0.46674,0 -0.46674,-0.39846q0,-0.17931 0.13335,-0.29885t0.33339,-0.11954l7.40124,0q0.20003,0 0.33339,0.11954t0.13335,0.29885q0,0.39846 -0.46674,0.39846z" id="svg_1" stroke="null"/>
      </g>
     </g>
    </svg>`
    
    console.log(`.activeLineMarginClass{    
      background-image: url("data:image/svg+xml;base64,${btoa(svg)}");
    }`);
    
    */

      document.getElementsByTagName('head')[0].appendChild(style);
    }
  }

  setReadOnlyMode(value: boolean) {
    this.config.readOnly = value;
    this.canAddCondition.set(!value);
    this.renderAddCommentLineDecoration();
  }

  load(events: ReviewCommentEvent[]): void {
    const store = reduceComments(events);
    this.loadFromStore(store, events);
  }

  loadFromStore(store: ReviewCommentStore, events: ReviewCommentEvent[]) {
    this.editor.changeViewZones((changeAccessor: monacoEditor.editor.IViewZoneChangeAccessor) => {
      // Remove all the existing comments
      for (const viewState of Object.values(this.store.comments)) {
        const x = this.getRenderState(viewState.comment.id);
        if (x && x.viewZoneId !== null) {
          changeAccessor.removeZone(x.viewZoneId);
        }
      }

      this.events = events;
      this.store = store;
      this.store.deletedCommentIds = undefined;
      this.store.dirtyCommentIds = undefined;
      this.renderStore = {};

      this.refreshComments();

      //   this.verbose &&
      //     console.debug('Events Loaded:', events.length, 'Review Comments:', Object.values(this.store.comments).length);
    });
  }

  getThemedColor(name: string): string | null {
    // editor.background: e {rgba: e}
    // editor.foreground: e {rgba: e}
    // editor.inactiveSelectionBackground: e {rgba: e}
    // editor.selectionHighlightBackground: e {rgba: e}
    // editorIndentGuide.activeBackground: e {rgba: e}
    // editorIndentGuide.background: e {rgba: e}
    let themeName: string | null = null;
    let value: string | null = null;
    let theme: any = null;

    const themeService = (this.editor as any)._themeService;
    if (themeService.getTheme) {
      // v21
      theme = themeService.getTheme();
      themeName = theme?.themeName;
    } else if (themeService._theme) {
      // v20
      theme = themeService._theme;
    }

    value = theme.getColor(name);

    // HACK - Buttons themes are not in monaco ... so just hack in theme for dark
    const missingThemes = {
      dark: {
        'button.background': '#0e639c',
        'button.foreground': '#ffffff',
      },
      light: {
        'button.background': '#007acc',
        'button.foreground': '#ffffff',
      },
    };
    if (!value && themeName) {
      value = missingThemes[themeName.indexOf('dark') > -1 ? 'dark' : 'light'][name];
    }
    return value;
  }

  applyStyles(element: HTMLElement, className: string) {
    if (this.config.styles[className] === undefined) {
      //   console.log('[CLASSNAME]', className);
    } else {
      if (this.config.styles[className]) {
        for (const [key, value] of Object.entries(this.config.styles[className])) {
          element.style[key] = value;
        }
      }

      if (this.config.setClassNames) {
        element.className = className;
      }
    }
  }

  createInlineEditButtonsElement(): InlineToolbarElements {
    const root = document.createElement('div') as HTMLDivElement;
    this.applyStyles(root, 'editButtonsContainer');
    root.style.marginLeft = this.config.editButtonOffset;
    // root.style.marginTop = "100px";
    // root.style.fontSize = "12px";

    const add = document.createElement('span') as HTMLSpanElement;
    add.innerText = this.config.editButtonAddText;
    this.applyStyles(add, 'editButton.add');
    add.setAttribute(CONTROL_ATTR_NAME, '');
    add.onclick = () => this.setEditorMode(EditorMode.replyComment, 'reply-comment-inline-button');
    root.appendChild(add);

    let remove;
    let edit;
    let spacer;

    if (this.config.editButtonEnableRemove) {
      spacer = document.createElement('div') as HTMLDivElement;
      spacer.innerText = ' ';
      root.appendChild(spacer);

      remove = document.createElement('span') as HTMLSpanElement;
      remove.setAttribute(CONTROL_ATTR_NAME, '');
      remove.innerText = this.config.editButtonRemoveText;
      this.applyStyles(remove, 'editButton.remove');

      remove.onclick = () => this.activeComment && this.removeComment(this.activeComment.id);
      root.appendChild(remove);
    }

    if (this.config.editButtonEnableEdit) {
      spacer = document.createElement('div') as HTMLDivElement;
      spacer.innerText = ' ';
      root.appendChild(spacer);

      edit = document.createElement('span') as HTMLSpanElement;
      edit.setAttribute(CONTROL_ATTR_NAME, '');
      edit.innerText = this.config.editButtonEditText;

      this.applyStyles(edit, 'editButton.edit');
      edit.onclick = () => this.setEditorMode(EditorMode.editComment, 'edit-comment-button');
      root.appendChild(edit);
    }

    return { root, add, remove, edit };
  }

  handleCancel() {
    // console.log('[handleCancel]');
    this.setActiveComment(undefined, 'cancel');
    this.setEditorMode(EditorMode.toolbar, 'cancel');
    this.editor.focus();
  }

  handleAddComment() {
    const lineNumber = this.activeComment ? this.activeComment.lineNumber : this.editor.getSelection()?.endLineNumber;
    if (!lineNumber) return;
    const text = this.editorElements.textarea.value;
    const selection = this.activeComment ? undefined : (this.editor.getSelection() as CodeSelection);
    this.addComment(lineNumber, text, selection);
    this.setEditorMode(EditorMode.toolbar, 'add-comment-1');
    this.editor.focus();
  }

  handleTextAreaKeyDown(e: KeyboardEvent) {
    if (e.code === 'Escape') {
      this.handleCancel();
      e.preventDefault();
      //   console.info('[handleTextAreaKeyDown] preventDefault: Escape Key');
    } else if (e.code === 'Enter' && e.ctrlKey) {
      this.handleAddComment();
      e.preventDefault();
      //   console.info('[handleTextAreaKeyDown] preventDefault: ctrl+Enter');
    }
  }

  createInlineEditorElement(): EditorElements {
    const root = document.createElement('div') as HTMLDivElement;
    this.applyStyles(root, 'reviewCommentEditor');

    const textarea = document.createElement('textarea') as HTMLTextAreaElement;
    textarea.setAttribute(CONTROL_ATTR_NAME, '');
    this.applyStyles(textarea, 'reviewCommentEditor.text');
    textarea.innerText = '';
    textarea.rows = 3;
    textarea.name = 'text';
    textarea.onkeydown = this.handleTextAreaKeyDown.bind(this);

    const confirm = document.createElement('button') as HTMLButtonElement;
    confirm.setAttribute(CONTROL_ATTR_NAME, '');
    this.applyStyles(confirm, 'reviewCommentEditor.save');

    confirm.innerText = 'placeholder add';
    confirm.onclick = this.handleAddComment.bind(this);

    const cancel = document.createElement('button') as HTMLButtonElement;
    cancel.setAttribute(CONTROL_ATTR_NAME, '');
    this.applyStyles(cancel, 'reviewCommentEditor.cancel');
    cancel.innerText = 'Cancel';
    cancel.onclick = this.handleCancel.bind(this);

    root.appendChild(textarea);
    root.appendChild(cancel);
    root.appendChild(confirm);

    return { root, confirm, cancel, textarea };
  }

  createInlineToolbarWidget() {
    const buttonsElement = this.createInlineEditButtonsElement();

    this.widgetInlineToolbar = {
      allowEditorOverflow: true,
      getId: () => {
        return 'widgetInlineToolbar';
      },
      getDomNode: () => {
        return buttonsElement.root;
      },
      getPosition: () => {
        if (this.activeComment && this.editorMode === EditorMode.toolbar && !this.config.readOnly) {
          return {
            position: {
              lineNumber: this.activeComment.lineNumber,
              column: 1,
            },
            preference: [POSITION_BELOW],
          };
        }
        return null;
      },
    };

    this.editor.addContentWidget(this.widgetInlineToolbar);
    return buttonsElement;
  }

  calculateConfirmButtonText() {
    if (this.editorMode === EditorMode.insertComment) {
      return 'Add Comment';
    }
    if (this.editorMode === EditorMode.replyComment) {
      return 'Reply to Comment';
    }
    return 'Edit Comment';
  }

  createInlineEditorWidget(): EditorElements {
    // doesn't re-theme when
    const editorElement = this.createInlineEditorElement();

    this.widgetInlineCommentEditor = {
      allowEditorOverflow: true,
      getId: () => {
        return 'widgetInlineEditor';
      },
      getDomNode: () => {
        return editorElement.root;
      },
      getPosition: () => {
        if (this.editorMode !== EditorMode.toolbar) {
          editorElement.confirm.innerText = this.calculateConfirmButtonText();
          return {
            position: {
              lineNumber: this.getActivePosition(),
              column: 1,
            },
            preference: [2],
          };
        }
        return null;
      },
    };

    this.editor.addContentWidget(this.widgetInlineCommentEditor);
    return editorElement;
  }

  getActivePosition(): number {
    const position = this.editor.getPosition();
    const activePosition = this.activeComment ? this.activeComment.lineNumber : position?.lineNumber;
    // does it need an offset?
    console.log('[getActivePosition]', activePosition, this.activeComment?.lineNumber, position?.lineNumber);
    return activePosition ?? 0;
  }

  setActiveComment(comment?: ReviewComment, reason?: string) {
    this.verbose && console.debug('[setActiveComment]', comment, reason);

    this.canCancelCondition.set(Boolean(this.activeComment));

    const isDifferentComment = this.activeComment !== comment;

    const lineNumbersToMakeDirty: number[] = [];
    if (this.activeComment && (!comment || this.activeComment.lineNumber !== comment.lineNumber)) {
      lineNumbersToMakeDirty.push(this.activeComment.lineNumber);
    }
    if (comment) {
      lineNumbersToMakeDirty.push(comment.lineNumber);
    }

    this.activeComment = comment;
    if (lineNumbersToMakeDirty.length > 0) {
      this.filterAndMapComments(lineNumbersToMakeDirty, (_comment) => {
        const cs = this.renderStore[_comment.id];
        if (cs) {
          cs.renderStatus = ReviewCommentRenderState.dirty;
        }
      });
    }

    return isDifferentComment;
  }

  filterAndMapComments(lineNumbers: number[], fn: { (comment: ReviewComment): void }) {
    for (const cs of Object.values(this.store.comments)) {
      if (lineNumbers.indexOf(cs.comment.lineNumber) > -1) {
        fn(cs.comment);
      }
    }
  }

  handleMouseMove(ev: monacoEditor.editor.IEditorMouseEvent) {
    if (ev.target && ev.target.position && ev.target.position.lineNumber) {
      this.currentLineDecorationLineNumber = ev.target.position.lineNumber;
      this.renderAddCommentLineDecoration(
        this.config.readOnly === true ? undefined : this.currentLineDecorationLineNumber
      );
    }
  }

  renderAddCommentLineDecoration(lineNumber?: number) {
    const lines: monacoEditor.editor.IModelDeltaDecoration[] = lineNumber
      ? [
          {
            range: new monacoEditor.Range(lineNumber, 0, lineNumber, 0),
            options: {
              marginClassName: 'activeLineMarginClass', // TODO - fix the creation of this style
              zIndex: 100,
            },
          },
        ]
      : [];
    this.currentLineDecorations = this.editor.deltaDecorations(this.currentLineDecorations, lines);
  }

  handleMouseDown(ev: monacoEditor.editor.IEditorMouseEvent) {
    // Not ideal - but couldn't figure out a different way to identify the glyph event
    if (ev?.target?.element?.className && ev.target.element.className.indexOf('activeLineMarginClass') > -1) {
      this.currentLineDecorationLineNumber &&
        this.editor.setPosition({
          lineNumber: this.currentLineDecorationLineNumber,
          column: 1,
        });
      this.setEditorMode(EditorMode.insertComment, 'mouse-down-1');
    } else if (!ev?.target?.element?.hasAttribute(CONTROL_ATTR_NAME)) {
      let activeComment = this.activeComment;

      if ((ev.target as any)?.detail && (ev.target as any)?.detail.viewZoneId !== null) {
        for (const cs of Object.values(this.store.comments)) {
          const rs = this.getRenderState(cs.comment.id);
          if (rs.viewZoneId === (ev.target as any)?.detail.viewZoneId) {
            activeComment = cs.comment;
            // console.log(cs.comment.text, cs.history.length);
            break;
          }
        }
      }

      const commentChanged = this.setActiveComment(activeComment, 'handleMouseDown');
      this.refreshComments();

      if (commentChanged && this.activeComment) {
        this.setEditorMode(EditorMode.toolbar, 'mouse-down-2');
      }
    }
  }

  private calculateMarginTopOffset(includeActiveCommentHeight: boolean): number {
    let marginTop = 0;

    if (this.activeComment) {
      for (const item of this.iterateComments()) {
        if (
          item.state.comment.lineNumber === this.activeComment.lineNumber &&
          (item.state.comment !== this.activeComment || includeActiveCommentHeight)
        ) {
          marginTop += this.commentHeightCache[this.getHeightCacheKey(item)] ?? 0;
        }

        if (item.state.comment === this.activeComment) {
          break;
        }
      }
    }
    return marginTop + this.config.verticalOffset;
  }

  layoutInlineToolbar() {
    const editorBgColor = this.getThemedColor('editor.background');
    if (editorBgColor) this.inlineToolbarElements.root.style.backgroundColor = editorBgColor;
    this.inlineToolbarElements.root.style.marginTop = `${this.calculateMarginTopOffset(false)}px`;

    if (this.inlineToolbarElements.remove) {
      const hasChildren =
        this.activeComment && this.iterateComments((c) => c.comment.id === this.activeComment?.id).length > 1;
      const isSameUser = this.activeComment && this.activeComment.author === this.currentUser;
      this.inlineToolbarElements.remove.style.display = hasChildren ? 'none' : '';
      this.inlineToolbarElements.edit.style.display = hasChildren || !isSameUser ? 'none' : '';
    }

    this.widgetInlineToolbar && this.editor.layoutContentWidget(this.widgetInlineToolbar);
  }

  layoutInlineCommentEditor() {
    const selectionHighlightColor = this.getThemedColor('editor.selectionHighlightBackground');
    if (selectionHighlightColor) this.editorElements.root.style.backgroundColor = selectionHighlightColor;
    const editorForegroundColor = this.getThemedColor('editor.foreground');
    if (editorForegroundColor) {
      this.editorElements.root.style.color = editorForegroundColor;
      this.editorElements.textarea.style.color = editorForegroundColor;
    }
    this.editorElements.root.style.marginTop = `${this.config.verticalOffset}px`;
    const editorBgColor = this.getThemedColor('editor.background');
    if (editorBgColor) this.editorElements.textarea.style.backgroundColor = editorBgColor;
    const buttonBgColor = this.getThemedColor('button.background');
    const buttonColor = this.getThemedColor('button.foreground');
    if (buttonBgColor && buttonColor) {
      [(this.editorElements.confirm, this.editorElements.cancel)].forEach((button) => {
        button.style.backgroundColor = buttonBgColor;
        button.style.color = buttonColor;
      });
    }

    this.editorElements.confirm.innerText = this.editorMode === EditorMode.editComment ? 'Edit Comment' : 'Add Comment';

    this.widgetInlineCommentEditor && this.editor.layoutContentWidget(this.widgetInlineCommentEditor);
  }

  createEmptyCommentOnCurrentLine(): ReviewComment {
    return {
      id: uuid.v4(),
      author: '',
      lineNumber: this.getActivePosition(),
      text: '',
      status: ReviewCommentStatus.active,
      dt: new Date().getTime(),
      selection: undefined,
    };
  }

  setEditorMode(mode: EditorMode, why?: string) {
    const activeComment =
      mode === EditorMode.insertComment ? this.createEmptyCommentOnCurrentLine() : this.activeComment;

    this.editorMode = this.config.readOnly ? EditorMode.toolbar : mode;
    this.verbose &&
      console.log(
        'setEditorMode',
        EditorMode[mode],
        why,
        'Comment:',
        activeComment,
        'ReadOnly:',
        this.config.readOnly,
        'Result:',
        EditorMode[this.editorMode]
      );

    this.layoutInlineToolbar();
    this.layoutInlineCommentEditor();
    activeComment && this.setActiveComment(activeComment);
    this.refreshComments();

    if (mode !== EditorMode.toolbar) {
      if (mode === EditorMode.insertComment || mode === EditorMode.replyComment) {
        this.editorElements.textarea.value = '';
      } else if (mode === EditorMode.editComment) {
        this.editorElements.textarea.value = activeComment?.text ? activeComment.text : '';
      }
      // HACK - because the event in monaco doesn't have preventdefault which means editor takes focus back...
      setTimeout(() => this.editorElements.textarea.focus(), 100); // TODO - make configurable
    }
  }

  getDateTimeNow(): number {
    return new Date().getTime();
  }

  private recurseComments(
    allComments: { [key: string]: ReviewCommentState },
    filterFn: { (c: ReviewCommentState): boolean },
    depth: number,
    results: ReviewCommentIterItem[]
  ) {
    const comments = Object.values(allComments).filter(filterFn);
    for (const cs of comments) {
      const comment = cs.comment;
      delete allComments[comment.id];

      results.push({
        depth,
        state: cs,
      });
      this.recurseComments(allComments, (x) => x.comment.parentId === comment.id, depth + 1, results);
    }
  }

  private iterateComments(filterFn?: { (c: ReviewCommentState): boolean }) {
    if (!filterFn) {
      filterFn = (cs: ReviewCommentState) => !cs.comment.parentId;
    }
    const copyCommentState = { ...this.store.comments };
    const results: ReviewCommentIterItem[] = [];
    this.recurseComments(copyCommentState, filterFn, 0, results);
    return results;
  }

  removeComment(id: string) {
    return this.addEvent({
      type: 'delete',
      targetId: id,
      createdAt: new Date().getTime(),
      id: uuid.v4(),
      createdBy: '',
    });
  }

  addComment(lineNumber: number, text: string, selection?: CodeSelection) {
    const event: ReviewCommentEvent =
      this.editorMode === EditorMode.editComment
        ? {
            type: 'edit',
            text,
            targetId: this.activeComment?.id,
            createdAt: new Date().getTime(),
            id: uuid.v4(),
            createdBy: '',
          }
        : {
            type: 'create',
            text,
            lineNumber,
            selection,
            targetId: this.activeComment && this.activeComment.id,
            createdAt: new Date().getTime(),
            id: uuid.v4(),
            createdBy: '',
          };

    return this.addEvent(event);
  }

  private addEvent(event: ReviewCommentEvent) {
    event.createdBy = this.currentUser;
    event.createdAt = this.getDateTimeNow();
    event.id = uuid.v4();

    this.events.push(event);
    this.store = commentReducer(event, this.store);

    this.setActiveComment();
    this.refreshComments();
    this.layoutInlineToolbar();

    if (this.onChange) {
      this.onChange(this.events);
    }

    return event;
  }

  private formatDate(dt: number) {
    if (Number.isInteger(dt)) {
      try {
        const d = new Date(dt);
        if (this.config.formatDate) {
          return this.config.formatDate(d);
        }
        return d.toISOString();
      } catch {
        console.warn('[formatDate] Unable to convert', dt, 'to date object');
      }
    }
    return `${dt}`;
  }

  private createElement(text: string | null, className: string, tagName?: string) {
    const span = document.createElement(tagName || 'span') as HTMLSpanElement;
    this.applyStyles(span, className);
    if (text) {
      span.innerText = text;
    }
    return span;
  }

  getRenderState(commentId: string): RenderStoreItem {
    if (!this.renderStore[commentId]) {
      this.renderStore[commentId] = {};
    }
    return this.renderStore[commentId];
  }

  editId: string;
  commentHeightCache: Record<string, number> = {};

  refreshComments() {
    this.editor.changeViewZones((changeAccessor) => {
      const lineNumbers: { [key: number]: CodeSelection } = {};

      if (this.editorMode !== EditorMode.toolbar) {
        // This creates a blank section viewZone that makes space for the interactive text file for editing
        if (this.editId) {
          changeAccessor.removeZone(this.editId);
        }

        const node = document.createElement('div');
        // node.style.backgroundColor = "orange";

        this.editId = changeAccessor.addZone({
          afterLineNumber: this.getActivePosition(),
          heightInPx: 100,
          domNode: node,
          suppressMouseDown: true,
        });
      } else if (this.editId) {
        changeAccessor.removeZone(this.editId);
      }

      for (const cid of Array.from(this.store.deletedCommentIds || [])) {
        const viewZoneId = this.renderStore[cid]?.viewZoneId;
        viewZoneId && changeAccessor.removeZone(viewZoneId);
        this.verbose && console.debug('Zone.Delete', viewZoneId);
      }
      this.store.deletedCommentIds = undefined;

      for (const cid of Array.from(this.store.dirtyCommentIds || [])) {
        this.getRenderState(cid).renderStatus = ReviewCommentRenderState.dirty;
      }
      this.store.dirtyCommentIds = undefined;

      for (const item of this.iterateComments()) {
        const rs = this.getRenderState(item.state.comment.id);

        if (rs.renderStatus === ReviewCommentRenderState.hidden) {
          this.verbose && console.debug('Zone.Hidden', item.state.comment.id);

          rs.viewZoneId && changeAccessor.removeZone(rs.viewZoneId);
          rs.viewZoneId = undefined;

          // eslint-disable-next-line no-continue
          continue;
        }

        if (rs.renderStatus === ReviewCommentRenderState.dirty) {
          this.verbose && console.debug('Zone.Dirty', item.state.comment.id);

          rs.viewZoneId && changeAccessor.removeZone(rs.viewZoneId);
          rs.viewZoneId = undefined;
          rs.renderStatus = ReviewCommentRenderState.normal;
        }

        const lineNo = item.state.comment.lineNumber;
        if (!lineNumbers[lineNo] && item.state.comment.selection) {
          lineNumbers[lineNo] = item.state.comment.selection;
        }

        if (rs.viewZoneId == null) {
          this.verbose && console.debug('Zone.Create', item.state.comment.id);

          const isActive = this.activeComment === item.state.comment;

          const domNode = this.config.renderComment
            ? this.config.renderComment(isActive, item)
            : this.renderComment(isActive, item);

          const heightInPx = this.measureHeighInPx(item, domNode);

          rs.viewZoneId = changeAccessor.addZone({
            afterLineNumber: item.state.comment.lineNumber,
            heightInPx,
            domNode,
            suppressMouseDown: true, // This stops focus being lost the editor - meaning keyboard shortcuts keeps working
          });
        }
      }

      if (this.config.showInRuler) {
        const decorators: any[] = [];
        for (const [lnStr, selection] of Object.entries(lineNumbers)) {
          const ln = Number(lnStr);
          decorators.push({
            range: new monacoEditor.Range(ln, 0, ln, 0),
            options: {
              isWholeLine: true,
              overviewRuler: {
                color: this.config.rulerMarkerColor,
                darkColor: this.config.rulerMarkerDarkColor,
                position: 1,
              },
            },
          });

          if (selection) {
            decorators.push({
              range: new monacoEditor.Range(
                selection.startLineNumber,
                selection.startColumn,
                selection.endLineNumber,
                selection.endColumn
              ),
              options: {
                className: 'reviewComment selection',
              },
            });
          }
        }

        this.currentCommentDecorations = this.editor.deltaDecorations(this.currentCommentDecorations, decorators);
      }
    });
  }

  private measureHeighInPx(item: ReviewCommentIterItem, domNode: HTMLElement): number {
    const cacheKey = this.getHeightCacheKey(item);
    // attach to dom to calculate height
    if (this.commentHeightCache[cacheKey] === undefined) {
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.top = '0px';
      container.appendChild(domNode);
      document.body.appendChild(container);
      const height = container.offsetHeight;
      document.body.removeChild(container);
      container.removeChild(domNode);

      this.commentHeightCache[cacheKey] = height;

      console.log('calculated height', height);
    } else {
      console.log('using cached height', cacheKey, this.commentHeightCache[item.state.comment.id]);
    }
    return this.commentHeightCache[cacheKey];
  }

  private getHeightCacheKey(item: ReviewCommentIterItem) {
    return `${item.state.comment.id}-${item.state.history.length}`;
  }

  private renderComment(isActive: boolean, item: ReviewCommentIterItem) {
    const rootNode = this.createElement(null, `reviewComment`); // .${isActive ? "active" : "inactive"}`);
    rootNode.style.marginLeft = `${this.config.commentIndent * (item.depth + 1) + this.config.commentIndentOffset}px`;
    const editorSelectionBgColor = this.getThemedColor('editor.selectionHighlightBackground');
    if (editorSelectionBgColor) rootNode.style.backgroundColor = editorSelectionBgColor;

    const domNode = this.createElement(null, `reviewComment.${isActive ? 'active' : 'inactive'}`);
    rootNode.appendChild(domNode);

    // // For Debug - domNode.appendChild(this.createElement(`${item.state.comment.id}`, 'reviewComment id'))
    domNode.appendChild(this.createElement(`${item.state.comment.author || ' '} at `, 'reviewComment.author'));
    domNode.appendChild(this.createElement(this.formatDate(item.state.comment.dt), 'reviewComment.dt'));
    if (item.state.history.length > 1) {
      domNode.appendChild(
        this.createElement(`(Edited ${item.state.history.length - 1} times)`, 'reviewComment.history')
      );
    }

    const n = this.createElement(null, 'reviewComment.text', 'div');
    n.innerHTML = item.state.comment.text;
    domNode.appendChild(n);

    return rootNode;
  }

  // calculateNumberOfLines(text: string): number {
  //   return 10;
  //   text ? text.split(/\r*\n/).length + 1 : 1;
  // }

  addActions() {
    this.editor.addAction({
      id: 'my-unique-id-cancel',
      label: 'Cancel Comment',
      keybindings: [monacoEditor.KeyCode.Escape],
      precondition: 'cancel-context-key',
      keybindingContext: undefined,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 0,
      run: () => this.handleCancel(),
    });

    this.editor.addAction({
      id: 'my-unique-id-add',
      label: 'Add Comment',
      keybindings: [monacoEditor.KeyMod.CtrlCmd, monacoEditor.KeyCode.F10],
      precondition: 'add-context-key',
      keybindingContext: undefined,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 0,

      run: () => {
        this.setEditorMode(EditorMode.insertComment, 'add-comment-context-menu');
      },
    });

    // this.editor.addAction({
    //   id: 'my-unique-id-next',
    //   label: 'Next Comment',
    //   keybindings: [monacoWindow.monaco.KeyMod.CtrlCmd | monacoWindow.monaco.KeyCode.F12],
    //   precondition: null,
    //   keybindingContext: null,
    //   contextMenuGroupId: 'navigation',
    //   contextMenuOrder: 0.101,

    //   run: () => {
    //     this.navigateToComment(NavigationDirection.next);
    //   },
    // });

    // this.editor.addAction({
    //   id: 'my-unique-id-prev',
    //   label: 'Prev Comment',
    //   keybindings: [monacoWindow.monaco.KeyMod.CtrlCmd | monacoWindow.monaco.KeyCode.F11],
    //   precondition: null,
    //   keybindingContext: null,
    //   contextMenuGroupId: 'navigation',
    //   contextMenuOrder: 0.102,

    //   run: () => {
    //     this.navigateToComment(NavigationDirection.prev);
    //   },
    // });
  }

  //   navigateToComment(direction: NavigationDirection) {
  //     let currentLine = 0;
  //     if (this.activeComment) {
  //       currentLine = this.activeComment.lineNumber;
  //     } else {
  //       currentLine = this.editor.getPosition().lineNumber;
  //     }

  //     const comments = Object.values(this.store.comments)
  //       .map((cs) => cs.comment)
  //       .filter((c) => {
  //         if (!c.parentId) {
  //           if (direction === NavigationDirection.next) {
  //             return c.lineNumber > currentLine;
  //           } else if (direction === NavigationDirection.prev) {
  //             return c.lineNumber < currentLine;
  //           }
  //         }
  //       });

  //     if (comments.length) {
  //       comments.sort((a, b) => {
  //         if (direction === NavigationDirection.next) {
  //           return a.lineNumber - b.lineNumber;
  //         } else if (direction === NavigationDirection.prev) {
  //           return b.lineNumber - a.lineNumber;
  //         }
  //       });

  //       const comment = comments[0];
  //       this.setActiveComment(comment);
  //       this.refreshComments();
  //       this.layoutInlineToolbar();
  //       this.editor.revealLineInCenter(comment.lineNumber);
  //     }
  //   }
}

export function createReviewManager(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
  currentUser: string,
  onChange: OnActionsChanged,
  actions?: ReviewCommentEvent[],
  config?: ReviewManagerConfig,
  verbose?: boolean
): ReviewManager {
  // For Debug: (window as any).editor = editor;
  const rm = new ReviewManager(editor, currentUser, onChange, config, verbose);
  rm.load(actions || []);
  return rm;
}
