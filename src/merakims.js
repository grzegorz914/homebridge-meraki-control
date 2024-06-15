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
        const refreshInterval = config.refreshInterval;

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

        const timers = [
            { name: 'checkDeviceInfo', interval: refreshInterval }
        ];

        const impulseGenerator = new ImpulseGenerator(timers);
        impulseGenerator.on('checkDeviceInfo', async () => {
            const debug = debugLog ? this.emit('debug', `requesting data.`) : false;
            try {
                //get data of switch
                const portsUrl = CONSTANTS.ApiUrls.MsPorts.replace('serialNumber', device.serialNumber);
                const swData = await this.axiosInstance.get(portsUrl);
                const debug1 = debugLog ? this.emit('debug', `data: ${JSON.stringify(swData.data, null, 2)}`) : false;

                //check device state
                impulseGenerator.emit('checkDeviceState', swData.data);
            } catch (error) {
                this.emit('error', `requesting data error: ${error}.`);
            };
        }).on('checkDeviceState', (swData) => {
            const debug = debugLog ? this.emit('debug', `requesting ports status.`) : false;
            try {
                const exposedPorts = [];
                for (const port of swData) {
                    const hideUplinksPorts = device.hideUplinkPorts && port.name.substr(0, 6) === 'Uplink';
                    const hidePortByName = swHidenPortsByName.includes(port.name);

                    //push exposed ports to array
                    if (!hideUplinksPorts && !hidePortByName) {
                        const obj = {
                            'id': port.portId,
                            'name': port.name,
                            'state': port.enabled,
                            'poeState': port.poeEnabled
                        };
                        exposedPorts.push(obj);
                    }
                };
                const portsCount = exposedPorts.length;
                const debug1 = debugLog ? this.emit('debug', `found: ${portsCount} exposed ports.`) : false;

                if (portsCount === 0) {
                    return;
                }

                //emit device info and state
                this.emit('deviceInfo', portsCount);
                this.emit('deviceState', exposedPorts, portsCount);
            } catch (error) {
                this.emit('error', `requesting port status error: ${error}.`);
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
module.exports = MerakiMs;
