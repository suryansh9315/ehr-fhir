import winston from 'winston';

const isDev = process.env.NODE_ENV !== 'production';

export function createLogger(service: string): winston.Logger {
  return winston.createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    defaultMeta: { service },
    format: isDev
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.printf(({ timestamp, level, service: svc, message, ...rest }) => {
            const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
            return `${timestamp} [${svc}] ${level}: ${message}${extra}`;
          })
        )
      : winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
    transports: [new winston.transports.Console()],
  });
}
