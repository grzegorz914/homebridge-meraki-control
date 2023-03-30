'use strict';
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

        const baseUrl = (`${host}${CONSTANS.ApiUrls.BaseUrl}`);
        const wirelessUrl = `/networks/${networkId}/wireless/ssids`;
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Cisco-Meraki-API-Key': apiKey
            }
        });

        //hidde ssid by name
        const hidenSsidsName = [];
        for (const hideSsid of hideSsidsName) {
            const hideSsidName = hideSsid.name || 'Undefined';
            const hideSsidEnabled = hideSsid.mode || false;
            const pushHideSsidsName = (hideSsidEnabled && hideSsidName !== 'Undefined') ? hidenSsidsName.push(hideSsidName) : false;
        };

        this.on('updateAccessPoints', async () => {
            const debug = debugLog ? this.emit('debug', `requesting switches data.`) : false;
            try {
                const ssidsNumber = [];
                const ssidsName = [];
                const ssidsState = [];

                //ap ssids states
                const ssidsData = await this.axiosInstance.get(wirelessUrl);
                const debug = debugLog ? this.emit('debug', `Debug access points data: ${JSON.stringify(ssidsData.data, null, 2)}`) : false;

                if (ssidsData.status !== 200) {
                    this.emit('message', `Update access points data status: ${ssidsData.status}.`);
                    return;
                }

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
                if (ssidsCount === 0) {
                    return;
                }

                this.emit('data', ssidsNumber, ssidsName, ssidsState, ssidsCount);
                this.updateAccessPoints();
            } catch (error) {
                this.emit('error', `access points data errorr: ${error}.`);
                this.updateAccessPoints()
            };
        })

        this.emit('updateAccessPoints');
    };

    async updateAccessPoints() {
        await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
        this.emit('updateAccessPoints');
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
