import { z } from 'zod';
import { commonSchema, instanceSchema, loadConfig } from './runtime';
export const configSchema = commonSchema
  .extend({
    instances: z
      .array(
        instanceSchema.extend({
          host: z.string().min(1),
          pingInterval: z.number().positive().default(15000),
          pongTimeout: z.number().positive().default(5000),
          reconnectInterval: z.number().positive().default(15000),
        }),
      )
      .min(1),
  })
  .superRefine((value, ctx) => unique(value.instances, ctx));
/**
 * Executes `unique`.
 * @param instances - Value of type `{ id: string; topic: string; }[]`.
 * @param ctx - Value of type `$RefinementCtx<unknown>`.
 * @returns Result of type `void`.
 */
function unique(instances: { id: string; topic: string }[], ctx: z.RefinementCtx) {
  for (const [index, entry] of instances.entries())
    for (let prior = 0; prior < index; prior++)
      if (instances[prior].id === entry.id || instances[prior].topic === entry.topic)
        ctx.addIssue({ code: 'custom', path: ['instances', index], message: 'instance id and topic must be unique' });
}
export type WledConfig = z.infer<typeof configSchema>['instances'][number];
export const CONFIG = loadConfig(configSchema);
