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
            const debug = debugLog ? this.emit('debug', `access points requesting data.`) : false;
            try {
                //ap ssids states
                const ssidsData = await this.axiosInstance.get(wirelessUrl);
                const debug = debugLog ? this.emit('debug', `access points data: ${JSON.stringify(ssidsData.data, null, 2)}`) : false;

                //check device state
                this.emit('checkDeviceState', ssidsData);
            } catch (error) {
                this.emit('error', `access points check device info, ${error}.`);
                this.checkDeviceInfo();
            };
        }).on('checkDeviceState', async (ssidsData) => {
            const debug = debugLog ? this.emit('debug', `access points requesting SSIDs state.`) : false;
            try {
                const ssidsNumber = [];
                const ssidsName = [];
                const ssidsState = [];

                for (const ssid of ssidsData.data) {
                    const ssidNumber = ssid.number;
                    const ssidName = ssid.name;
                    const ssidState = ssid.enabled;

                    //hidde unconfigured and ssids by name
                    const hideSsidsByName = hidenSsidsName.includes(ssidName);
                    const hideUnconfiguredSsids1 = hideUnconfiguredSsid && (ssidName.substr(0, 12) === 'Unconfigured');

                    //push exposed ssids to array
                    if (!hideUnconfiguredSsids1 && !hideSsidsByName) {
                        ssidsNumber.push(ssidNumber);
                        ssidsName.push(ssidName);
                        ssidsState.push(ssidState);
                    };
                };

                const ssidsCount = ssidsState.length;
                const debug1 = debugLog ? this.emit('debug', `access points found: ${ssidsCount} exposed SSIDs.`) : false;

                if (ssidsCount === 0) {
                    return;
                }

                //emit device info
                const emitDeviceInfo = this.prepareMr ? this.emit('deviceInfo', ssidsCount) : false;
                this.emit('deviceState', ssidsNumber, ssidsName, ssidsState, ssidsCount, this.prepareMr);
                this.prepareMr = false;
                this.updateAccessPoints();
            } catch (error) {
                this.emit('error', `access points check device state error, ${error}.`);
                this.checkDeviceInfo();
            };
        });

        this.emit('checkDeviceInfo');
    };

    async updateAccessPoints() {
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
