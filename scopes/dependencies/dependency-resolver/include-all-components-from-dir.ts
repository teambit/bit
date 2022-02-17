import fs from 'fs-extra'
import path from 'path'

export async function includeAllComponentsFromDir (rootDir: string, manifestsByPaths) {
  const files = await fs.readdir(rootDir, { withFileTypes: true })
  return Promise.all(
    files
      .filter((file) => file.isDirectory() && file.name !== 'node_modules')
      .map((dir) => path.join(rootDir, dir.name))
      .filter((dirPath) => !manifestsByPaths[dirPath])
      .map(async (dirPath) => {
        try {
          manifestsByPaths[dirPath] = await fs.readJson(path.join(dirPath, 'package.json'))
        } catch (err: any) {
          if (err.code !== 'ENOENT') throw err
        }
      })
  )
}

