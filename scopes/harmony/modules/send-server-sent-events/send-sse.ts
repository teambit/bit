type ExpressResponse = any; // better not to import the entire express lib here.

type CLIENT = {
  id: number;
  response: ExpressResponse;
};

const clients: CLIENT[] = [];

export function addClient(client: CLIENT) {
  clients.push(client);
}
export function removeClient(client: CLIENT) {
  clients.splice(clients.indexOf(client), 1);
}

type EventName =
  | 'onComponentChange'
  | 'onBitmapChange'
  | 'onWorkspaceConfigChange'
  | 'onPostInstall'
  | 'onLoader'
  | 'onLogWritten';

export function sendEventsToClients(eventName: EventName, data: any) {
  clients.forEach((client) => client.response.write(`event:${eventName}\ndata: ${JSON.stringify(data)}\n\n`));
}
