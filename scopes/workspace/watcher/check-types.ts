export enum CheckTypes {
  None, // keep this. it equals zero. this way we can do "if checkTypes() ... "
  EntireProject,
  ChangedFile,
}
