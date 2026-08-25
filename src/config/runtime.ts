import { load } from 'js-yaml';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
export const instanceSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[^/\s]+$/, 'id must not contain / or whitespace'),
  enabled: z.boolean().default(true),
  topic: z.string().min(1),
});
export const commonSchema = z.object({
  mqtt: z.object({
    protocol: z.enum(['mqtt', 'mqtts']).default('mqtt'),
    host: z.string().min(1),
    port: z.number().int().positive().default(1883),
    clientId: z.string(),
    username: z.string().optional(),
    password: z.string().optional(),
    keepAliveSeconds: z.number().int().positive().default(30),
    reconnectDelayMs: z.number().int().positive().default(5000),
  }),
  http: z
    .object({ host: z.string().default('0.0.0.0'), port: z.number().int().positive().default(3000) })
    .default({ host: '0.0.0.0', port: 3000 }),
  logging: z
    .object({ level: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log') })
    .default({ level: 'log' }),
});
/**
 * Executes `configFilePath`.
 * @returns Result of type `string`.
 */
export function configFilePath() {
  const index = process.argv.indexOf('--config');
  return path.resolve(process.env.CONFIG_FILE ?? (index >= 0 ? process.argv[index + 1] : 'config/config.yml'));
}
/**
 * Executes `configDirectory`.
 * @returns Result of type `string`.
 */
export function configDirectory() {
  return path.dirname(configFilePath());
}
/**
 * Executes `loadConfig`.
 * @param schema - Value of type `T`.
 * @returns Result of type `output<T>`.
 */
export function loadConfig<T extends z.ZodType>(schema: T): z.infer<T> {
  const file = configFilePath();
  if (!existsSync(file)) throw new Error(`Configuration file not found: ${file}`);
  return schema.parse(load(readFileSync(file, 'utf8')));
}
