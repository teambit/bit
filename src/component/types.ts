/**
 * Snap metadata
 *
 * @export
 * @interface Log
 */
export interface Log {
  /**
   * message added by the `Snap` author.
   */
  message: string;
  /**
   * Snap date.
   */
  date: string;
  /**
   * author of the component `Snap`.
   */
  author: Author;
}

export interface Author {
  /**
   * The author display name.
   */
  displayName?: string;
  /**
   * The author display email.
   */
  email?: string;
}
