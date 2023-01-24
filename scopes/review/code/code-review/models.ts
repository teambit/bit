import { ComponentID } from '@teambit/component-id';
import { ICodeAnnotator, InitCodeAnnotatorProps, OnChange } from '@teambit/review.code.annotator';

export type CodeReviewAnnotatorProps = {
  init: (props: WithEditorType<InitCodeAnnotatorProps>) => ICodeAnnotator;
  props: (props: WithEditorType) => Omit<InitCodeAnnotatorProps, 'onChange' | 'editor'>;
  onChange: (props: WithEditorType<CodeReviewViewState>) => OnChange;
  onDestroy: (props: WithEditorType) => void;
};

export type EditorType = 'base' | 'modified';
export type WithEditorType<T = {}> = T & { editorType: EditorType };

export type CodeReviewViewState = {
  ignoreWhitespace: boolean;
  view: CodeReviewViewMode;
  wrap: boolean;
  language: string;
  baseId?: ComponentID;
  compareId?: ComponentID;
  codeAnnotator?: ICodeAnnotator;
};

export type CodeReviewViewMode = 'split' | 'inline';
