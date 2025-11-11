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
        this.firstRun = true;

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

        //lock flags
        this.locks = false;
        this.impulseGenerator = new ImpulseGenerator()
            .on('connect', () => this.handleWithLock(async () => {
                await this.connect();
            }))
            .on('state', (state) => {
                this.emit(state ? 'success' : 'warn', `Impulse generator ${state ? 'started' : 'stopped'}`);
            });
    };

    async handleWithLock(fn) {
        if (this.locks) return;

        this.locks = true;
        try {
            await fn();
        } catch (error) {
            this.emit('error', `Inpulse generator error: ${error}`);
        } finally {
            this.locks = false;
        }
    }

    async checkDeviceState(ssidsData) {
        if (this.enableDebugMode) this.emit('debug', `Requesting SSIDs status.`);
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
            if (this.enableDebugMode) this.emit('debug', `Found: ${ssidsCount} exposed SSIDs.`);

            if (ssidsCount === 0) {
                this.emit('warn', `Found: ${ssidsCount} ssids.`);
                return false;
            }

            //emit device info and state
            if (this.firstRun) {
                this.emit('deviceInfo', ssidsCount);
                this.firstRun = false;
            }
            this.emit('deviceState', ssids);

            return true;
        } catch (error) {
            throw new Error(`Requesting SSIDs status error: ${error}`);
        };
    };

    async connect() {
        if (this.enableDebugMode) this.emit('debug', `Requesting data.`);
        try {
            //ap ssids states
            const ssidsData = await this.axiosInstance.get(this.wirelessUrl);
            if (this.enableDebugMode) this.emit('debug', `Data: ${JSON.stringify(ssidsData.data, null, 2)}`);
            const state = await this.checkDeviceState(ssidsData.data);

            return state;
        } catch (error) {
            throw new Error(`Requesting data error: ${error}`);
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
