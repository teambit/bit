export default function immutableUnshift(arr: Array<any>, newEntry: any): Array<any> {
  return [newEntry, ...arr];
}
