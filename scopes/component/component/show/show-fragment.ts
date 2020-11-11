import { Component } from '../component';

export interface ShowFragment {
  /**
   * render a row into the `show` CLI.
   */
  renderRow(component: Component): Promise<ShowRow>;

  /**
   * return a json output.
   */
  json?(component: Component): Promise<JSONRow>;

  /**
   * weight is used to determine the position of the fragment
   * within the `show` table.
   */
  weight?: number;
}

export interface JSONRow {
  /**
   * name of the field.
   */
  title: string;

  /**
   * json content.
   * TODO: change this from any to a more structured type (e.g. Serializable).
   */
  json: any;
}

export interface ShowRow {
  /**
   * title of the fragment
   */
  title: string;

  /**
   * content to render within the fragment.
   */
  content: string;
}
