import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
  redact: {
    paths: [
      "*.token",
      "*.password",
      "*.secret",
      "*.apiKey",
      "*.authorization",
      "headers.authorization",
      "headers.cookie",
    ],
    censor: "[REDACTED]",
  },
});

export function createChildLogger(module: string) {
  return logger.child({ module });
}
