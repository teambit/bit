export class GraphQlError {
  constructor(
    /**
     * http status code of error
     */
    public readonly code: number,

    /**
     * error message of the error
     */
    public readonly message?: string
  ) {}
}
