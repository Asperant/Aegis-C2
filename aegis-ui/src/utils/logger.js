const isDev = Boolean(import.meta.env?.DEV);

const noop = () => {};

export const logger = {
  info: isDev ? (...args) => console.info(...args) : noop,
  warn: isDev ? (...args) => console.warn(...args) : noop,
  error: isDev ? (...args) => console.error(...args) : noop,
};
