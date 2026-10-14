import { loader } from '@teambit/legacy.loader';

type ImportProgress = { reason: string | null; ids: string[]; components: number; objects: number };

/** Validate the entire receipt before any visible command or filesystem effects. */
export function commandProgress(value: any, operation: 'checkout' | 'merge') {
  if (value === undefined) return async () => {};
  if (!Number.isSafeInteger(value.bitmapCount) || value.bitmapCount < 0 || !Array.isArray(value.imports))
    throw new Error('native command progress receipt');
  if (value.snapFailed !== undefined && typeof value.snapFailed !== 'boolean')
    throw new Error('native command snap progress state');
  const loads: number[] = value.loads ?? [];
  if (
    !Array.isArray(loads) ||
    loads.length > 4 ||
    loads.some((count) => !Number.isSafeInteger(count) || count < 0 || count > 4096)
  )
    throw new Error('native command snap progress receipt');
  const rows: ImportProgress[] = value.imports;
  if (
    rows.length > 16384 ||
    rows.some(
      (row) =>
        ![
          null,
          'of their latest on main',
          'for getting missing versions and dependencies',
          'for getting the common-snap between main and main',
          'for making sure the new components are really new and are not out-of-sync',
        ].includes(row.reason) ||
        !Array.isArray(row.ids) ||
        row.ids.length > 16384 ||
        row.ids.some((id) => typeof id !== 'string' || id.length > 4096) ||
        !Number.isSafeInteger(row.components) ||
        row.components < 0 ||
        !Number.isSafeInteger(row.objects) ||
        row.objects < 0 ||
        row.objects > 16384
    )
  )
    throw new Error('native command import progress receipt');
  return async () => {
    if (operation !== 'checkout') {
      rows.forEach(renderImport);
      for (const count of loads) loader.start(`loading ${count} component(s)`);
      if (loads.length && !value.snapFailed) {
        loader.start('importing missing dependencies...');
        loader.start('adding dependencies graph...');
      }
      return;
    }
    loader.start('switching component version...');
    loader.start('importing components');
    const started = process.hrtime();
    for (const row of rows.filter(
      (entry) =>
        entry.reason === 'of their latest on main' || entry.reason === 'for getting missing versions and dependencies'
    )) {
      if (row.reason === 'for getting missing versions and dependencies')
        loader.start(`import ${value.bitmapCount} components with their dependencies (if missing)`);
      renderImport(row);
    }
    loader.succeed('importing components', started);
    rows
      .filter(
        (entry) =>
          entry.reason === null ||
          entry.reason === 'for making sure the new components are really new and are not out-of-sync'
      )
      .forEach(renderImport);
  };
}

function renderImport(row: ImportProgress) {
  if (!row.ids.length) return;
  const count = new Set(row.ids.map((id) => id.replace(/@[^@]+$/, ''))).size;
  const ids = count === row.ids.length ? `${count} components` : `${count} components, ${row.ids.length} versions`;
  const reason = row.reason ? ` ${row.reason}` : '';
  const message = `importing ${ids}${reason}`;
  loader.start(message);
  if (!process.env.CI)
    for (let downloaded = 100; downloaded <= row.objects; downloaded += 100)
      loader.start(`${message}. downloaded ${downloaded} objects.`);
  const imported = row.components ? `${row.components} components` : `${row.objects} objects`;
  loader.start(`successfully imported ${imported}${reason}`);
}
