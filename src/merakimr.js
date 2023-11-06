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
        const hideSsidsName = config.hideSsidsName;
        const debugLog = config.debugLog;
        this.refreshInterval = config.refreshInterval;
        this.prepareMr = true;

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
                keepAlive: true,
                rejectUnauthorized: false
            })
        });

        //hidde ssid by name
        const hidenSsidsName = [];
        for (const hideSsid of hideSsidsName) {
            const hideSsidName = hideSsid.name || 'Undefined';
            const hideSsidEnabled = hideSsid.mode || false;
            const pushHideSsidsName = (hideSsidEnabled && hideSsidName !== 'Undefined') ? hidenSsidsName.push(hideSsidName) : false;
        };

        this.on('checkDeviceInfo', async () => {
            try {
                const debug = debugLog ? this.emit('debug', `Access Points, requesting data.`) : false;
                //ap ssids states
                const ssidsData = await this.axiosInstance.get(wirelessUrl);
                const debug1 = debugLog ? this.emit('debug', `Access Points, data: ${JSON.stringify(ssidsData.data, null, 2)}`) : false;

                //check device state
                this.emit('checkDeviceState', ssidsData.data);
            } catch (error) {
                this.emit('error', ` data error: ${error}.`);
                this.refreshData();
            };
        }).on('checkDeviceState', (ssidsData) => {
            try {
                const debug = debugLog ? this.emit('debug', `Access Points, requesting SSIDs status.`) : false;
                const exposedSsids = [];

                for (const ssid of ssidsData) {
                    const ssidName = ssid.name;

                    //hidde unconfigured and ssids by name
                    const hideSsidsByName = hidenSsidsName.includes(ssidName);
                    const hideUnconfiguredSsids1 = hideUnconfiguredSsid && (ssidName.substr(0, 12) === 'Unconfigured');

                    //push exposed ssids to array
                    if (!hideUnconfiguredSsids1 && !hideSsidsByName) {
                        const obj = {
                            'number': ssid.number,
                            'name': ssidName,
                            'state': ssid.enabled
                        };
                        exposedSsids.push(obj);
                    };
                };

                const ssidsCount = exposedSsids.length;
                const debug1 = debugLog ? this.emit('debug', `Access Points, found: ${ssidsCount} exposed SSIDs.`) : false;

                if (ssidsCount === 0) {
                    return;
                }

                //emit device info
                const emitDeviceInfo = this.prepareMr ? this.emit('deviceInfo', ssidsCount) : false;
                this.emit('deviceState', exposedSsids, ssidsCount);
                this.prepareMr = false;
                this.refreshData();
            } catch (error) {
                this.emit('error', `Access Points, requesting SSIDs status error: ${error}.`);
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
