import { ENV } from './config/env';
import { logger } from './config/logger';
import { TOPICS } from './config/topics';
import { mqttClient } from './services/mqtt';
import { Wled } from './services/wled';
import { WledCommand } from './types/wled-cmd';
import { getJsonPaths } from './util/json';

const wled = new Wled(ENV.WLED_HOST);

//#region WLED to MQTT
wled.on('connected', () => {
	mqttClient.publish(TOPICS.WLED.ONLINE, 'true');
});
wled.on('disconnected', () => {
	mqttClient.publish(TOPICS.WLED.ONLINE, 'false');
});
wled.on('effects', (effects) => {
	mqttClient.publish(TOPICS.WLED.EFFECTS, JSON.stringify(effects));
});
wled.on('palettes', (palettes) => {
	mqttClient.publish(TOPICS.WLED.PALETTES, JSON.stringify(palettes));
});
wled.on('state', (state) => {
	if (ENV.PUSH_JSON_OBJECT) {
		mqttClient.publish(TOPICS.WLED.STATE, JSON.stringify(state));
	}
	if (ENV.PUSH_JSON_OBJECT) {
		const paths = getJsonPaths(state, '/');
		for (const [path, value] of paths) {
			mqttClient.publish(`${TOPICS.WLED.STATE}/${path}`, JSON.stringify(value));
		}
	}
});
wled.on('info', (info) => {
	if (ENV.PUSH_JSON_OBJECT) {
		mqttClient.publish(TOPICS.WLED.INFO, JSON.stringify(info));
	}
	if (ENV.PUSH_JSON_OBJECT) {
		const paths = getJsonPaths(info, '/');
		for (const [path, value] of paths) {
			mqttClient.publish(`${TOPICS.WLED.INFO}/${path}`, JSON.stringify(value));
		}
	}
});
//#endregion

//#region MQTT to WLED
mqttClient.on('message', (topic, payload) => {
	const msg = payload.toString();
	if (!msg || msg === '') return;
	if (topic !== TOPICS.MQTT.CMD) return;

	logger.scope('MQTT').log(`[RX] ${JSON.stringify(JSON.parse(msg))}`);

	const cmd: WledCommand = JSON.parse(msg) satisfies WledCommand;
	wled.handleCommand(cmd);

	logger.scope('MQTT').info('Reset command');
	mqttClient.publish(TOPICS.MQTT.CMD, '');
});

mqttClient.subscribe(TOPICS.MQTT.CMD);
//#endregion
