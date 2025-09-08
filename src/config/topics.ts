import { ENV } from './env';

export const TOPICS = {
	WLED: {
		ONLINE: `${ENV.TOPIC}/online` as const,
		STATE: `${ENV.TOPIC}/state` as const,
		EFFECTS: `${ENV.TOPIC}/effects` as const,
		PALETTES: `${ENV.TOPIC}/palettes` as const,
		INFO: `${ENV.TOPIC}/info` as const,
	},
	MQTT: {
		CMD: `${ENV.TOPIC}/cmd` as const,
	},
};
