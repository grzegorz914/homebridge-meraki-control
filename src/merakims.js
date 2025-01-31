import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import { ApiUrls } from './constants.js';

class MerakiMs extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const apiKey = config.apiKey;
        this.device = config.deviceData;
        this.enableDebugMode = config.enableDebugMode;

        const baseUrl = (`${host}${ApiUrls.Base}`);
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Cisco-Meraki-API-Key': apiKey
            }
        });

        //hidde port by name
        this.swHidenPortsByName = [];
        const hidePorts = this.device.hidePorts || [];
        for (const hidePort of hidePorts) {
            const hidePortName = hidePort.name ?? false;
            const hidePortEnabled = hidePort.mode || false;
            const pushHiddenPortName = hidePortName && hidePortEnabled ? this.swHidenPortsByName.push(hidePortName) : false;
        };

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
            //get data of switch
            const portsUrl = ApiUrls.MsPorts.replace('serialNumber', this.device.serialNumber);
            const swData = await this.axiosInstance.get(portsUrl);
            const debug1 = this.enableDebugMode ? this.emit('debug', `Data: ${JSON.stringify(swData.data, null, 2)}`) : false;

            //check device state
            const state = await this.checkDeviceState(swData.data);

            return state;
        } catch (error) {
            throw new Error(`Requesting data error: ${error}`);
        };
    };

    async checkDeviceState(swData) {
        const debug = this.enableDebugMode ? this.emit('debug', `Requesting ports status.`) : false;
        try {
            const exposedPorts = [];
            for (const port of swData) {
                const portName = port.name ?? false;

                //skip iterate
                if (!portName) {
                    const debug1 = this.enableDebugMode ? this.emit('debug', `Skipped Port: ${port.portId}, Name: ${port.name}.`) : false;
                    continue;
                }

                //hidde uplink and port by name
                const uplinkPort = portName.startsWith('Uplink');
                const hideUplinkPort = this.device.hideUplinkPorts && uplinkPort;
                const hidePortByName = this.swHidenPortsByName.includes(portName);

                //skip iterate
                if (hideUplinkPort || hidePortByName) {
                    continue;
                }

                //push exposed ports to array
                const obj = {
                    'id': port.portId,
                    'name': portName,
                    'state': port.enabled,
                    'poeState': port.poeEnabled
                };
                exposedPorts.push(obj);
            };
            const portsCount = exposedPorts.length;
            const debug2 = this.enableDebugMode ? this.emit('debug', `Found: ${portsCount} exposed ports.`) : false;

            if (portsCount === 0) {
                return false;
            }

            //emit device info and state
            this.emit('deviceInfo', portsCount);
            this.emit('deviceState', exposedPorts, portsCount);

            return true;
        } catch (error) {
            throw new Error(`Requesting port status error: ${error}.`);
        };
    };

    async send(url, payload) {
        try {
            await this.axiosInstance.put(url, payload);
            return true;;
        } catch (error) {
            throw new Error(error);
        };
    };
};
export default MerakiMs;
