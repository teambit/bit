interface Command {
  command(): {
    synopsis: string,
    run: () => Promise<any>
  }
}
