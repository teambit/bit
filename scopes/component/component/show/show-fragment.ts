import { Component } from '@teambit/component';

export interface ShowFragment {
  /**
   * title of the fragment
   */
  title: string;

  /**
   * content to render within the fragment.
   */
  content: string;

  /**
   * weight is used to determine the position of the fragment
   * within the `show` table.
   */
  weight: number;
}

export type ShowFragmentFactory = (component: Component) => ShowFragment;
