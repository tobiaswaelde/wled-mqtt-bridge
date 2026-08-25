import { randomUUID } from 'node:crypto';

/**
 * Uses the configured MQTT client ID or creates one for this process.
 *
 * @param {string} clientId Configured client ID.
 * @returns {string} Effective client ID.
 */
export function resolveMqttClientId(clientId: string): string {
  return clientId === '' ? randomUUID() : clientId;
}
