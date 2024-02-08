'use strict';
const https = require('https');
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');

class MerakiMr extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const apiKey = config.apiKey;
        const networkId = config.networkId;
        const hideUnconfiguredSsid = config.hideUnconfiguredSsid;
        const hidenSsidsName = config.deviceData;
        const debugLog = config.debugLog;
        this.refreshInterval = config.refreshInterval;

        const baseUrl = (`${host}${CONSTANS.ApiUrls.Base}`);
        const wirelessUrl = CONSTANS.ApiUrls.MrSsids.replace('networkId', networkId);
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Cisco-Meraki-API-Key': apiKey
            },
            withCredentials: true,
            httpsAgent: new https.Agent({
                keepAlive: false,
                rejectUnauthorized: false
            })
        });

        this.on('checkDeviceInfo', async () => {
            const debug = debugLog ? this.emit('debug', `requesting data.`) : false;
            try {
                //ap ssids states
                const ssidsData = await this.axiosInstance.get(wirelessUrl);
                const debug1 = debugLog ? this.emit('debug', `data: ${JSON.stringify(ssidsData.data, null, 2)}`) : false;

                //check device state
                this.emit('checkDeviceState', ssidsData.data);
            } catch (error) {
                this.emit('error', ` data error: ${error}.`);
                this.refreshData();
            };
        }).on('checkDeviceState', (ssidsData) => {
            const debug = debugLog ? this.emit('debug', `requesting SSIDs status.`) : false;
            try {
                const exposedSsids = [];

                for (const ssid of ssidsData) {
                    const ssidName = ssid.name;

                    //hidde unconfigured and ssids by name
                    const hideSsidsByName = hidenSsidsName.includes(ssidName);
                    const hideUnconfiguredSsids = hideUnconfiguredSsid && (ssidName.substr(0, 12) === 'Unconfigured');

                    //push exposed ssids to array
                    if (!hideUnconfiguredSsids && !hideSsidsByName) {
                        const obj = {
                            'number': ssid.number,
                            'name': ssidName,
                            'state': ssid.enabled
                        };
                        exposedSsids.push(obj);
                    };
                };

                const ssidsCount = exposedSsids.length;
                const debug1 = debugLog ? this.emit('debug', `found: ${ssidsCount} exposed SSIDs.`) : false;

                if (ssidsCount === 0) {
                    return;
                }

                //emit device info and state
                this.emit('deviceInfo', ssidsCount);
                this.emit('deviceState', exposedSsids, ssidsCount);
                this.refreshData();
            } catch (error) {
                this.emit('error', `requesting SSIDs status error: ${error}.`);
                this.refreshData();
            };
        });

        this.emit('checkDeviceInfo');
    };

    async refreshData() {
        await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
        this.emit('checkDeviceInfo');
    };

    send(url, payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.axiosInstance.put(url, payload);
                await new Promise(resolve => setTimeout(resolve, 750));
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MerakiMr;
