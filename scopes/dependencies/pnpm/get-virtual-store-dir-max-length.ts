export function getVirtualStoreDirMaxLength() {
  return process.platform === 'win32' ? 60 : 120;
}
