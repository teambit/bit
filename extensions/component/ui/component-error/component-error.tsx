import React from 'react';

export class ComponentError {
  constructor(
    /**
     * http status code of error
     */
    public readonly code: number,

    /**
     * http status code of error
     */
    public readonly message?: string
  ) {}

  renderError() {
    return <div>{this.code}</div>;
  }
}
