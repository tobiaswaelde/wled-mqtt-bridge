import { randomUUID } from 'node:crypto';

/**
 * Uses the configured MQTT client ID or creates one for this process.
 *
 * @param clientId - Configured client ID of type `string`.
 * @returns Effective client ID of type `string`.
 */
export function resolveMqttClientId(clientId: string): string {
  return clientId || randomUUID();
}
