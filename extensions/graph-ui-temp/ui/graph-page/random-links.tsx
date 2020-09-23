// TEMP! WIP!

export function randomLinks<T>(arr: T[], limit: number) {
  const res: [T, T][] = [];

  for (let i = 0; i < limit; i++) {
    const idx1 = Math.round(Math.random() * arr.length);
    const idx2 = Math.round(Math.random() * arr.length);
    if (idx1 === idx2) {
      i -= 1;
      continue;
    }
    res.push([arr[idx1], arr[idx2]]);
  }

  return res;
}
