import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import { ApiUrls } from './constants.js';

class MerakiMr extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const apiKey = config.apiKey;
        const networkId = config.networkId;
        this.hideUnconfiguredSsids = config.hideUnconfiguredSsid;
        this.hidenSsidsName = config.deviceData;
        this.enableDebugMode = config.enableDebugMode;

        const baseUrl = (`${host}${ApiUrls.Base}`);
        this.wirelessUrl = ApiUrls.MrSsids.replace('networkId', networkId);
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Cisco-Meraki-API-Key': apiKey
            }
        });

        this.impulseGenerator = new ImpulseGenerator();
        this.impulseGenerator.on('checkDeviceInfo', async () => {
            try {
                await this.connect();
            } catch (error) {
                this.emit('error', `Inpulse generator error: ${error}`);
            };
        }).on('state', (state) => {
            const emitState = state ? this.emit('success', `Impulse generator started.`) : this.emit('warn', `Impulse generator stopped.`);
        });
    };

    async connect() {
        const debug = this.enableDebugMode ? this.emit('debug', `Requesting data.`) : false;
        try {
            //ap ssids states
            const ssidsData = await this.axiosInstance.get(this.wirelessUrl);
            const debug1 = this.enableDebugMode ? this.emit('debug', `Data: ${JSON.stringify(ssidsData.data, null, 2)}`) : false;
            const state = await this.checkDeviceState(ssidsData.data);

            return state;
        } catch (error) {
            throw new Error(`Requesting data error: ${error}`);
        };
    };

    async checkDeviceState(ssidsData) {
        const debug = this.enableDebugMode ? this.emit('debug', `Requesting SSIDs status.`) : false;
        try {
            const exposedSsids = [];
            for (const ssid of ssidsData) {
                const ssidName = ssid.name ?? false;

                if (!ssidName) {
                    const debug1 = this.enableDebugMode ? this.emit('debug', `Skipped SSID: ${ssid.number}, Name: ${ssid.name}.`) : false;
                    continue;
                }

                //hidde unconfigured and ssids by name
                const unconfiguredSsid = ssidName.startsWith('Unconfigured');
                const hideUnconfiguredSsid = this.hideUnconfiguredSsids && unconfiguredSsid;
                const hideSsidByName = this.hidenSsidsName.includes(ssidName);

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
            const debug2 = this.enableDebugMode ? this.emit('debug', `Found: ${ssidsCount} exposed SSIDs.`) : false;

            if (ssidsCount === 0) {
                return false;
            }

            //emit device info and state
            this.emit('deviceInfo', ssidsCount);
            this.emit('deviceState', exposedSsids, ssidsCount);

            return true;
        } catch (error) {
            throw new Error(`Requesting SSIDs status error: ${error}`);
        };
    };

    async send(url, payload) {
        try {
            await this.axiosInstance.put(url, payload);
            return true;
        } catch (error) {
            throw new Error(error);
        };
    };
};
export default MerakiMr;
