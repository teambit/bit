/**
 * author type.
 */
export type Author = {
  /**
   * author full name (for example: "Ran Mizrahi")
   */
  displayName: string;
  /**
   * author username (for example: "ranm8")
   */
  name?: string; // added this to support the usual structure of an author
  // TODO - @ran, is this ok with you?

  /**
   * author email in a proper format (e.g. "ran@bit.dev")
   */
  email: string;
};
