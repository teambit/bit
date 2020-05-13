export type LogPublisher = {
  info: (...any) => void;
  warn: (...any) => void;
  error: (...any) => void;
  debug: (...any) => void;
};
