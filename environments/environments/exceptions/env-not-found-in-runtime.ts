export class EnvNotFoundInRuntime extends Error {
  constructor(private id: string) {
    super(`environment with ID: ${id} was not found configured to any of your components`);
  }
}
