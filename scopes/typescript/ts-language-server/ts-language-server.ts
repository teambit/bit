import { join } from 'path';
import * as rpc from 'vscode-ws-jsonrpc/lib';
import * as server from 'vscode-ws-jsonrpc/lib/server';
import * as lsp from 'vscode-languageserver/lib/main';

export class TsLanguageServer {
  static create() {
    const serverConnection = server.createServerProcess('ts', 'node', [join(__dirname, 'start.js'), '--stdio']);
    serverConnection.reader.listen((data) => {
      console.log(data);
    });

    const connection = rpc.createMessageConnection(serverConnection.reader, serverConnection.writer);
    const a = connection.sendNotification(lsp.DefinitionRequest.method, {});

    // server.forward(socketConnection, serverConnection, message => {
    //     if (rpc.isRequestMessage(message)) {
    //         if (message.method === lsp.InitializeRequest.type.method) {
    //             const initializeParams = message.params as lsp.InitializeParams;
    //             initializeParams.processId = process.pid;
    //         }
    //     }
    //     return message;
    // });
  }
}
