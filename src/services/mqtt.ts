import mqtt from 'mqtt';
import { ENV } from '../config/env';
import { logger } from '../config/logger';
import { TOPICS } from '../config/topics';

export const mqttClient = mqtt.connect(
	`${ENV.MQTT_PROTOCOL}://${ENV.MQTT_HOST}:${ENV.MQTT_PORT}?EIO=3&transport=websocket`,
	{
		clientId: ENV.MQTT_CLIENTID,
		port: ENV.MQTT_PORT,
		username: ENV.MQTT_USERNAME,
		password: ENV.MQTT_PASSWORD,
		rejectUnauthorized: false,
		clean: false,

		will: {
			topic: TOPICS.WLED.ONLINE,
			payload: 'false',
		},
	}
);

mqttClient.on('error', (err) => {
	logger.scope('mqtt').error('MQTT connection error', err);
});
