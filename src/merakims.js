'use strict';
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');

class MerakiMs extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const apiKey = config.apiKey;
        const switches = config.switches;
        const debugLog = config.debugLog;
        this.refreshInterval = config.refreshInterval;

        const baseUrl = (`${host}${CONSTANS.ApiUrls.BaseUrl}`);
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Cisco-Meraki-API-Key': apiKey
            }
        });

        const swNames = [];
        const swSerialsNumber = [];
        const swHideUplinksPort = [];
        const swHiddenPortsByName = [];
        const swPortsSensorEnabled = [];

        for (const sw of switches) {
            const name = sw.name || 'Undefined';
            const serialNumber = sw.serialNumber ?? false;
            const controlEnabled = sw.mode || false;
            const hideUplinkPort = sw.hideUplinkPorts || false;
            const enableSonsorPorts = sw.enableSonsorPorts || false;

            if (serialNumber && controlEnabled) {
                swNames.push(name);
                swSerialsNumber.push(serialNumber);
                swHideUplinksPort.push(hideUplinkPort);
                swPortsSensorEnabled.push(enableSonsorPorts);

                //hidde port by name
                for (const hidePort of sw.hidePorts) {
                    const hidePortName = hidePort.name;
                    const hidePortEnabled = hidePort.mode || false;
                    const pushHiddenPortName = hidePortName && hidePortEnabled ? swHiddenPortsByName.push(hidePortName) : false;
                };
            };
        };

        this.on('updateSwitches', async () => {
            const debug = debugLog ? this.emit('debug', `requesting switches data.`) : false;
            try {
                const swCount = switches.length;
                if (swCount === 0) {
                    return;
                }

                const swPortsSn = [];
                const swPortsId = [];
                const swPortsName = [];
                const swPortsState = [];
                const swPortsPoeState = [];
                const swPortsSensorsEnable = [];

                for (let i = 0; i < swCount; i++) {
                    const serialNumber = swSerialsNumber[i];
                    const hideUplinks = swHideUplinksPort[i];
                    const enableSonsorPorts = swPortsSensorEnabled[i];

                    const portsUrl = `/devices/${serialNumber}/switch/ports`;
                    const swData = await this.axiosInstance.get(portsUrl);
                    const debug = debugLog ? this.emit('debug', `Debug switches data: ${JSON.stringify(swData.data, null, 2)}`) : false;

                    if (swData.status !== 200) {
                        this.emit('message', `Update switches data status: ${swData.status}.`);
                        return;
                    }

                    for (const port of swData.data) {
                        const portId = port.portId;
                        const portName = port.name;
                        const portState = port.enabled;
                        const portPoeState = port.poeEnabled;
                        const hideUplinksPorts = hideUplinks && portName.substr(0, 6) === 'Uplink';
                        const hidePortByName = swHiddenPortsByName.includes(portName);

                        //push exposed ports to array
                        if (!hideUplinksPorts && !hidePortByName) {
                            swPortsSn.push(serialNumber);
                            swPortsId.push(portId);
                            swPortsName.push(portName);
                            swPortsState.push(portState);
                            swPortsPoeState.push(portPoeState);
                            swPortsSensorsEnable.push(enableSonsorPorts);
                        }
                    };
                };

                const swPortsCount = swPortsState.length;
                if (swPortsCount === 0) {
                    return;
                }

                this.emit('data', swPortsSn, swPortsId, swPortsName, swPortsState, swPortsPoeState, swPortsSensorsEnable, swPortsCount);
                this.updateSwitches()
            } catch (error) {
                this.emit('error', `switches data errorr: ${error}.`);
                this.updateSwitches()
            };
        })

        this.emit('updateSwitches');
    };

    async updateSwitches() {
        await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
        this.emit('updateSwitches');
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
module.exports = MerakiMs;
