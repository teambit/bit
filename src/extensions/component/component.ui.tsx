export type Server = {
  env: string;
  url: string;
};

export type Component = {
  id: string;
  server: Server;
};
