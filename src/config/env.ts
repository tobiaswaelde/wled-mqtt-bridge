import { cleanEnv, str, num, bool } from 'envalid';
import dotenv from 'dotenv';
import * as path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

export const ENV = cleanEnv(process.env, {
	MQTT_PROTOCOL: str({ default: 'mqtt' }),
	MQTT_HOST: str(),
	MQTT_PORT: num({ default: 1883 }),
	MQTT_USERNAME: str(),
	MQTT_PASSWORD: str(),
	MQTT_CLIENTID: str({ default: crypto.randomUUID(), devDefault: crypto.randomUUID() }),

	WLED_HOST: str({ desc: 'The hostname or IP address of the WLED instance' }),
	TOPIC: str(),
	WLED_POLL_INTERVAL: num({ default: 1000 }),
	WLED_TIMEOUT: num({ default: 30000 }),
	WLED_TIMEOUT_DURATION: num({ default: 30000 }),

	PUSH_JSON_OBJECT: bool({ default: true }),
	PUSH_JSON_KEYS: bool({ default: true }),
});
