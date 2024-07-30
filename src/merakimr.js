'use strict';
const axios = require('axios');
const EventEmitter = require('events');
const ImpulseGenerator = require('./impulsegenerator.js');
const CONSTANTS = require('./constants.json');

class MerakiMr extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const apiKey = config.apiKey;
        const networkId = config.networkId;
        const hideUnconfiguredSsids = config.hideUnconfiguredSsid;
        const hidenSsidsName = config.deviceData;
        const debugLog = config.debugLog;
        const refreshInterval = config.refreshInterval;

        const baseUrl = (`${host}${CONSTANTS.ApiUrls.Base}`);
        const wirelessUrl = CONSTANTS.ApiUrls.MrSsids.replace('networkId', networkId);
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Cisco-Meraki-API-Key': apiKey
            }
        });

        const timers = [
            { name: 'checkDeviceInfo', interval: refreshInterval }
        ];

        const impulseGenerator = new ImpulseGenerator(timers);
        impulseGenerator.on('checkDeviceInfo', async () => {
            const debug = debugLog ? this.emit('debug', `requesting data.`) : false;
            try {
                //ap ssids states
                const ssidsData = await this.axiosInstance.get(wirelessUrl);
                const debug1 = debugLog ? this.emit('debug', `data: ${JSON.stringify(ssidsData.data, null, 2)}`) : false;

                //check device state
                impulseGenerator.emit('checkDeviceState', ssidsData.data);
            } catch (error) {
                this.emit('error', ` data error: ${error}.`);
            };
        }).on('checkDeviceState', (ssidsData) => {
            const debug = debugLog ? this.emit('debug', `requesting SSIDs status.`) : false;
            try {
                const exposedSsids = [];
                for (const ssid of ssidsData) {
                    const ssidName = ssid.name ?? false;

                    if (!ssidName) {
                        const debug = debugLog ? this.emit('debug', `Skipped SSID: ${ssid.number}, Name: ${ssid.name}.`) : false;
                        continue;
                    }

                    //hidde unconfigured and ssids by name
                    const unconfiguredSsid = ssidName.startsWith('Unconfigured');
                    const hideUnconfiguredSsid = hideUnconfiguredSsids && unconfiguredSsid;
                    const hideSsidByName = hidenSsidsName.includes(ssidName);

                    //skip iterate
                    if (hideUnconfiguredSsid || hideSsidByName) {
                        continue;
                    }

                    //push exposed ssid to array
                    const obj = {
                        'number': ssid.number,
                        'name': ssidName,
                        'state': ssid.enabled
                    };
                    exposedSsids.push(obj);
                };

                const ssidsCount = exposedSsids.length;
                const debug1 = debugLog ? this.emit('debug', `found: ${ssidsCount} exposed SSIDs.`) : false;

                if (ssidsCount === 0) {
                    return;
                }

                //emit device info and state
                this.emit('deviceInfo', ssidsCount);
                this.emit('deviceState', exposedSsids, ssidsCount);
            } catch (error) {
                this.emit('error', `requesting SSIDs status error: ${error}.`);
            };
        });

        impulseGenerator.start();
    };

    send(url, payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.axiosInstance.put(url, payload);
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MerakiMr;
