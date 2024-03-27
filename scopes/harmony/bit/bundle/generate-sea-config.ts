import fs from 'fs-extra';
import { join } from 'path';

export async function generateSeaConfig(bundleDir: string, jsAppFile: string, blobAppFile: string) {
  const config = {
    main: join(bundleDir, jsAppFile),
    output: join(bundleDir, blobAppFile),
    disableExperimentalSEAWarning: true, // Default: false
    useSnapshot: false, // Default: false
    useCodeCache: true, // Default: false
  };

  const seaConfigPath = join(bundleDir, 'sea-config.json');
  fs.writeJSONSync(seaConfigPath, config, { spaces: 2 });
}
