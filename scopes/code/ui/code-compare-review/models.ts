export enum ReviewManagerEventType {
  AddEvent = 1,
  UpdateEvent = 2,
}
export type ReviewEvent = {
  type: ReviewManagerEventType;
  comments: ReviewComment[];
};

export type ReviewComment = {
  id?: string;
  author?: string;
  date?: number;
  lineNumber?: number;
  selection?: CodeSelection;
  // text: string;
  // parentId?: string;
  // status: ReviewCommentStatus;
};

export type CodeSelection = {
  startColumn: number;
  endColumn: number;
  startLineNumber: number;
  endLineNumber: number;
};

export const CONTROL_ATTR_NAME = 'ReviewManagerControl';
export const POSITION_BELOW = 2; // above=1, below=2, exact=0
// const POSITION_EXACT = 0;

export type OnChange = (event: ReviewEvent) => void;

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
