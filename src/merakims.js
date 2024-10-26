'use strict';
const axios = require('axios');
const EventEmitter = require('events');
const ImpulseGenerator = require('./impulsegenerator.js');
const CONSTANTS = require('./constants.json');

class MerakiMs extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const apiKey = config.apiKey;
        const device = config.deviceData;
        const debugLog = config.debugLog;

        const baseUrl = (`${host}${CONSTANTS.ApiUrls.Base}`);
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Cisco-Meraki-API-Key': apiKey
            }
        });

        //hidde port by name
        const swHidenPortsByName = [];
        const hidePorts = device.hidePorts || [];
        for (const hidePort of hidePorts) {
            const hidePortName = hidePort.name ?? false;
            const hidePortEnabled = hidePort.mode || false;
            const pushHiddenPortName = hidePortName && hidePortEnabled ? swHidenPortsByName.push(hidePortName) : false;
        };

        this.impulseGenerator = new ImpulseGenerator();
        this.impulseGenerator.on('checkDeviceInfo', async () => {
            const debug = debugLog ? this.emit('debug', `Requesting data.`) : false;
            try {
                //get data of switch
                const portsUrl = CONSTANTS.ApiUrls.MsPorts.replace('serialNumber', device.serialNumber);
                const swData = await this.axiosInstance.get(portsUrl);
                const debug1 = debugLog ? this.emit('debug', `Data: ${JSON.stringify(swData.data, null, 2)}`) : false;

                //check device state
                this.impulseGenerator.emit('checkDeviceState', swData.data);
            } catch (error) {
                this.emit('error', `Requesting data error: ${error}`);
            };
        }).on('checkDeviceState', async (swData) => {
            const debug = debugLog ? this.emit('debug', `Requesting ports status.`) : false;
            try {
                const exposedPorts = [];
                for (const port of swData) {
                    const portName = port.name ?? false;

                    //skip iterate
                    if (!portName) {
                        const debug = debugLog ? this.emit('debug', `Skipped Port: ${port.portId}, Name: ${port.name}.`) : false;
                        continue;
                    }

                    //hidde uplink and port by name
                    const uplinkPort = portName.startsWith('Uplink');
                    const hideUplinkPort = device.hideUplinkPorts && uplinkPort;
                    const hidePortByName = swHidenPortsByName.includes(portName);

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
                const debug1 = debugLog ? this.emit('debug', `Found: ${portsCount} exposed ports.`) : false;

                if (portsCount === 0) {
                    return;
                }

                //emit device info and state
                this.emit('deviceInfo', portsCount);
                this.emit('deviceState', exposedPorts, portsCount);
                this.emit('prepareAccessory');
            } catch (error) {
                this.emit('error', `Requesting port status error: ${error}.`);
            };
        }).on('state', (state) => {
            const emitState = state ? this.emit('success', `Impulse generator started.`) : this.emit('warn', `Impulse generator stopped.`);
        });
    };

    async connect() {
        try {
            this.impulseGenerator.emit('checkDeviceInfo');
            return true;
        } catch (error) {
            throw new Error(error);
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
module.exports = MerakiMs;
