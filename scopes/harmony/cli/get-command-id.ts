export function getCommandId(cmdName: string) {
  return cmdName.split(' ')[0].trim();
}
