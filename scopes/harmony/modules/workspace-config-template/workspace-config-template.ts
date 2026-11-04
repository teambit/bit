import { readFile } from 'fs/promises';
import { join } from 'path';
import type { CommentObject } from 'comment-json';
import { parse, stringify } from 'comment-json';

/**
 * the default workspace.jsonc of a new workspace, parsed with its comments.
 */
export async function getWorkspaceConfigTemplateParsed(): Promise<Record<string, any>> {
  let fileContent: Buffer;
  try {
    fileContent = await readFile(join(__dirname, 'workspace-template.jsonc'));
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
    // when the component is compiled by tsc, it doesn't copy .jsonc files into the dists, grab it from src
    fileContent = await readFile(join(__dirname, '..', 'workspace-template.jsonc'));
  }
  return parse(fileContent.toString()) as CommentObject;
}

/**
 * stringify a workspace config, with the comments of the template.
 */
export function stringifyWorkspaceConfig(workspaceConfig: Record<string, any>): string {
  return stringify(workspaceConfig, undefined, 2);
}
