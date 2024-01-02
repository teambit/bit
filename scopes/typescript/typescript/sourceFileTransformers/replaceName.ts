export function replaceName(oldName: string, nameMapping: Record<string, string>): string | undefined {
  for (const old of Object.keys(nameMapping)) {
    if (oldName.startsWith(old) || oldName === old) {
      return oldName.replace(new RegExp(`^${old}`), nameMapping[old]);
    }
    if (oldName.endsWith(old)) {
      return oldName.replace(new RegExp(`${old}$`), nameMapping[old]);
    }
  }
  return undefined;
}
