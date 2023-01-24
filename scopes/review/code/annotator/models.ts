import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';

export interface ICodeAnnotator {
  onChange: OnChange;
  applySettingsAndLoadAnnotations(
    annotations: AnnotateItem[],
    settings?: ReviewManagerSettings,
    hardRefresh?: boolean
  ): void;
  load(annotations: AnnotateItem[]): void;
  renderLineReviewDecoration(lineNumbers: number[]): void;
  renderCodeSelectionReviewDecoration(codeSelections: CodeSelection[]): void;
  refresh(annotations?: AnnotateItem[], settings?: ReviewManagerSettings): void;
  dispose(): void;
}

export interface InitCodeAnnotatorProps {
  editor: monacoEditor.editor.IStandaloneCodeEditor;
  currentUser?: string;
  onChange: OnChange;
  annotations: AnnotateItem[];
  settings?: ReviewManagerSettings;
  verbose?: boolean;
}

export interface InitCodeAnnotator {
  (props: InitCodeAnnotatorProps): ICodeAnnotator;
}

export enum AnnotateEventType {
  AddEvent = 'Add',
  UpdateEvent = 'Update',
  SelectionEvent = 'Select',
}
export type IAnnotateEvent = {
  event: monacoEditor.IMouseEvent;
  type: AnnotateEventType;
  annotations: AnnotateItem[];
};

export type AnnotateItem = {
  id?: string;
  author?: string;
  date?: number;
  lineNumber?: number;
  selection?: CodeSelection;
};

export type CodeSelection = {
  startColumn: number;
  endColumn: number;
  startLineNumber: number;
  endLineNumber: number;
};

export const CONTROL_ATTR_NAME = 'ReviewManagerControl';
export const POSITION_BELOW = 2; // above=1, below=2, exact=0

export type OnChange = (event: IAnnotateEvent) => void;

export type BaseReviewSettings<T extends StyleSettings = StyleSettings> = {
  addReviewStyles: T;
  lineReviewStyles: T & {
    overrides?: Record<number, T>;
  };
  codeSelectionReviewStyles: T & {
    overrides?: Record<string, T>;
    overridesKey?: (codeSelection: CodeSelection) => string;
  };
};

export type ReviewManagerSettings = Partial<BaseReviewSettings>;

export type InternalReviewManagerSettings = BaseReviewSettings<BaseStyleSettings>;

export type StyleSettings = BaseStyleSettings | DefaultIconRenderer;

export type BaseStyleSettings = {
  className: string;
  styles: Partial<CSSStyleDeclaration>;
};

export type DefaultIconRenderer = {
  iconUrl: string;
};

export function hasDefaultIconRenderer(settings: StyleSettings): settings is DefaultIconRenderer {
  return 'iconUrl' in settings;
}

export function styleDeclarationToString(styles: Partial<CSSStyleDeclaration>): string {
  return Object.keys(styles)
    .map((prop) => `${camelToKebabParser(prop)}: ${styles[prop]} !important;`)
    .join('\n');
}

export function camelToKebabParser(str: string): string {
  const matcher = /[A-Z]/;
  const replacer = (match) => `-${match.toLowerCase()}`;
  const regex = RegExp(matcher, 'g');
  if (!str.match(regex)) {
    return str;
  }
  return str.replace(regex, replacer);
}

// @todo
export type TooltipRenderer = {};
