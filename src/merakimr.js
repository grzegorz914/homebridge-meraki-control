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

        this.call = false;
        this.impulseGenerator = new ImpulseGenerator();
        this.impulseGenerator.on('checkDeviceInfo', async () => {
            try {
                if (this.call) return;

                this.call = true;
                await this.connect();
                this.call = false;
            } catch (error) {
                this.call = false;
                this.emit('error', `Inpulse generator error: ${error}`);
            };
        }).on('state', (state) => {
            const emitState = state ? this.emit('success', `Impulse generator started.`) : this.emit('warn', `Impulse generator stopped.`); js
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
            const ssids = [];
            for (const ssid of ssidsData) {

                //push exposed ssid to array
                const obj = {
                    'number': ssid.number,
                    'name': ssid.name ?? `WiFi ${ssid.number}`,
                    'state': ssid.enabled ?? false
                };
                ssids.push(obj);
            };

            const ssidsCount = ssids.length;
            const debug2 = this.enableDebugMode ? this.emit('debug', `Found: ${ssidsCount} exposed SSIDs.`) : false;

            if (ssidsCount === 0) {
                this.emit('warn', `Found: ${ssidsCount} ssids.`);
                return false;
            }

            //emit device info and state
            this.emit('deviceInfo', ssidsCount);
            this.emit('deviceState', ssids);

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
