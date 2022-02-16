import openEditor from 'open-editor';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import { Tmp } from '../repositories';
import { BitId, BitIds } from '../../bit-id';
import loader from '../../cli/loader';

const DEFAULT_MESSAGE = 'DEFAULT:';
const DEFAULT_AUTO_TAG_MESSAGE = 'DEFAULT-AUTO-TAG:';
const formatId = (id: string) => `${id}:`;
const addSpace = (str: string) => `${str} `;
const DEFAULT_EDITOR = 'vim';

export type MessagePerComponent = { id: BitId; msg: string };

export class MessagePerComponentFetcher {
  private idsToTagObject: { [bitIdStr: string]: BitId };
  private idsToAutoTagObject: { [bitIdStr: string]: BitId };
  constructor(idsToTag: BitIds, idsToAutoTag: BitIds) {
    this.idsToTagObject = idsToTag.toObject();
    this.idsToAutoTagObject = idsToAutoTag.toObject();
  }

  async getMessagesFromEditor(tmp: Tmp, editor: string | boolean): Promise<MessagePerComponent[]> {
    const template = this.getTemplate();
    const templateFilePath = await tmp.save(template);
    const editorName = typeof editor === 'string' ? editor : undefined;
    await this.openEditor(templateFilePath, editorName);
    const afterSave = await fs.readFile(templateFilePath, 'utf-8');
    if (template === afterSave) {
      throw new Error(`no changes have been done to the messages templates. consider using "--message" flag instead`);
    }
    await tmp.remove(templateFilePath);
    return this.parseFileWithMessages(afterSave);
  }

  getTemplate() {
    const idsToTag = this.getIdsToTagStr();
    const idsToAutoTag = this.getIdsToAutoTagStr();
    const idsStr = (ids: string[]) => ids.map(formatId).map(addSpace).join('\n');
    const getAutoTagTemplate = () => {
      if (!idsToAutoTag.length) return '';
      return `
# The following components will be auto-tagged (due to dependencies bump)
# You can leave the following default message to avoid setting messages for these components
${DEFAULT_AUTO_TAG_MESSAGE} bump dependencies versions
${idsStr(idsToAutoTag)}
`;
    };
    return `# Please set the messages for the following components.
# You can enter a default-message to be applied to all empty components. this is optional.
${addSpace(DEFAULT_MESSAGE)}
${idsStr(idsToTag)}
${getAutoTagTemplate()}
`;
  }

  parseFileWithMessages(messagesFileContent: string): MessagePerComponent[] {
    let defaultMessage: string | null = null;
    let defaultAutoTagMessage: string | null = null;
    const results: MessagePerComponent[] = [];

    const idsToTagStr = this.getIdsToTagStr();
    const idsToAutoTagStr = this.getIdsToAutoTagStr();
    const messagesSplit = messagesFileContent.split('\n');

    // there are 4 sections in the template file. these 4 variables keep track in what section we're at.
    let startedDefaultMessage = false;
    let startedIdsToTag = false;
    let startedAutoTagDefaultMessage = false;
    let startedIdsToAutoTag = false;

    messagesSplit.forEach((line) => {
      line = line.trim();
      if (!line) {
        return; // an empty line
      }
      if (line.startsWith('#')) {
        return; // it's a comment
      }
      if (line.startsWith(DEFAULT_MESSAGE)) {
        defaultMessage = line.replace(DEFAULT_MESSAGE, '').trim();
        startedDefaultMessage = true;
        return;
      }
      const idToTag = idsToTagStr.find((id) => line.startsWith(formatId(id)));
      const removeId = (id: string) => line.replace(formatId(id), '').trim();
      if (idToTag) {
        startedIdsToTag = true;
        const msg = removeId(idToTag) || defaultMessage;
        if (!msg) {
          throw new Error(`error: "${idToTag}" has no message and the default-message was not set`);
        }
        results.push({
          id: this.idsToTagObject[idToTag],
          msg,
        });
        return;
      }
      if (line.startsWith(DEFAULT_AUTO_TAG_MESSAGE)) {
        startedAutoTagDefaultMessage = true;
        defaultAutoTagMessage = line.replace(DEFAULT_AUTO_TAG_MESSAGE, '').trim();
        return;
      }
      const idToAutoTag = idsToAutoTagStr.find((id) => line.startsWith(formatId(id)));
      if (idToAutoTag) {
        startedIdsToAutoTag = true;
        const msg = removeId(idToAutoTag) || defaultAutoTagMessage;
        if (!msg) {
          throw new Error(`error: "${idToTag}" has no message and the default-auto-message was not set`);
        }
        results.push({
          id: this.idsToAutoTagObject[idToAutoTag],
          msg,
        });
        return;
      }
      // must be another line of one of the strings above. let's figure out what was it.
      // the template starts with the default-message, followed by the ids to tag, followed by the
      // auto-tag-default-message, followed by the ids to auto-tag.
      if (!startedDefaultMessage) {
        throw new Error(
          `error: the following line was added "${line}". please add the messages to the ids and default fields only`
        );
      }
      if (!startedIdsToTag) {
        defaultMessage += `\n${line}`;
        return;
      }
      if (!startedAutoTagDefaultMessage) {
        const lastEnteredId = results[results.length - 1];
        lastEnteredId.msg += `\n${line}`;
        return;
      }
      if (!startedIdsToAutoTag) {
        defaultAutoTagMessage += `\n${line}`;
        return;
      }
      const lastEnteredId = results[results.length - 1];
      lastEnteredId.msg += `\n${line}`;
    });

    return results;
  }

  private async openEditor(templateFilePath: string, editor?: string) {
    const file = { file: templateFilePath, column: DEFAULT_MESSAGE.length + 1, line: 3 };

    const editorFromEnvVar = process.env.EDITOR || process.env.VISUAL; // taken from env-editor package
    if (!editorFromEnvVar && !editor) {
      editor = DEFAULT_EDITOR;
    }
    const editorData = openEditor.make([file], { editor });
    if (!editorData.isTerminalEditor) {
      throw new Error(
        `your editor "${editorData.binary}" is not a terminal editor. either set $EDITOR in your env variable or pass "--editor" with a terminal editor (e.g. "nano", "vim")`
      );
    }
    loader.stop();
    return new Promise((resolve, reject) => {
      const editorProcess = spawn(editorData.binary, editorData.arguments, { stdio: 'inherit' });
      editorProcess.on('exit', (code) => {
        if (code === 0) {
          resolve('completed');
        } else {
          reject(new Error(`${editor} had non zero exit code: ${code}`));
        }
      });
    });
  }

  private getIdsToTagStr() {
    return Object.keys(this.idsToTagObject);
  }
  private getIdsToAutoTagStr() {
    return Object.keys(this.idsToAutoTagObject);
  }
}
