import winston from 'winston';
import { config } from '../config/app.config';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const prettyFormat = printf(({ level, message, timestamp, stack, module: mod, ...meta }) => {
  const moduleTag = mod ? ` [${mod}]` : '';
  const metaStr   = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]${moduleTag}: ${stack || message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: config.log.level,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    config.log.format === 'pretty'
      ? combine(colorize(), prettyFormat)
      : json(),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

/**
 * Returns a child logger that automatically stamps every log line with
 * `{ module: '<name>' }` so log output is filterable by module.
 *
 * Usage:
 *   const log = childLogger('layer1:requirements');
 *   log.info('getRequirements called', { projectId });
 */
export function childLogger(moduleName: string): winston.Logger {
  return logger.child({ module: moduleName });
}
