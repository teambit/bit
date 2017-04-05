// TODO Doclet
export type Doclet = {

}

export type SpecsResults = {
  pass: boolean,
  stats: {
    duration: number,
    end: string,
    start: string
  },
  tests: Array<{
    duration: number,
    err: ?Object,
    pass: boolean,
    title: string
  }>
}

export type Log = {
  date: string,
  email: string,
  message: string,
  username: string
}

export type Source = {
  file: string,
  name: string
}

export type Ci = {
  startTime?: string,
  endTime?: string,
}

export type ComponentObject = {
  name: string,
  box: string,
  scope: string,
  version: string,
  ci: Ci,
  compiler: string,
  tester: string,
  dependencies: string[],
  flattenDependencies: string[],
  packageDependencies: {[string]: string},
  dist: Source,
  impl: Source,
  specs: Source,
  specsResults: SpecsResults,
  docs: Doclet[],
  log: Log
}
