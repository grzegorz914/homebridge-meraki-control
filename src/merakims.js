'use strict';
const https = require('https');
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

        const baseUrl = (`${host}${CONSTANS.ApiUrls.Base}`);
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

        const swCount = switches.length;
        const debug = debugLog ? this.emit('debug', `found: ${swCount} configured switch(es).`) : false;

        if (swCount === 0) {
            return;
        }

        const switchesArray = [];
        const swNames = [];
        const swSerialsNumber = [];
        const swHideUplinksPort = [];
        const swPrefixForPortName = [];
        const swHidenPortsByName = [];
        const swPoePortsControlEnabled = [];
        const swPortsSensorEnabled = [];

        for (const sw of switches) {
            const name = sw.name || 'Undefined';
            const serialNumber = sw.serialNumber ?? false;
            const controlEnabled = sw.mode || false;
            const hideUplinkPort = sw.hideUplinkPorts || false;
            const prefixForPortName = sw.enablePrefixForPortName || false;
            const enablePoePortsControl = sw.enablePoePortsControl || false;
            const enableSensorPorts = sw.enableSensorPorts || false;

            if (serialNumber && controlEnabled) {
                swNames.push(name);
                swSerialsNumber.push(serialNumber);
                swHideUplinksPort.push(hideUplinkPort);
                swPrefixForPortName.push(prefixForPortName);
                swPoePortsControlEnabled.push(enablePoePortsControl);
                swPortsSensorEnabled.push(enableSensorPorts);

                //hidde port by name
                for (const hidePort of sw.hidePorts) {
                    const hidePortName = hidePort.name;
                    const hidePortEnabled = hidePort.mode || false;
                    const pushHiddenPortName = hidePortName && hidePortEnabled ? swHidenPortsByName.push(hidePortName) : false;
                };
            };
        };

        this.on('checkDeviceInfo', async () => {
            try {
                const debug = debugLog ? this.emit('debug', `requesting switch data.`) : false;
                const enabledSwCount = swSerialsNumber.length;
                for (let i = 0; i < enabledSwCount; i++) {
                    const prefixName = swNames[i];
                    const serialNumber = swSerialsNumber[i];
                    const hideUplinks = swHideUplinksPort[i];
                    const prefixForPortName = swPrefixForPortName[i];
                    const enablePoePortsControl = swPoePortsControlEnabled[i];
                    const enableSensorPorts = swPortsSensorEnabled[i];

                    const portsUrl = CONSTANS.ApiUrls.MsPorts.replace('serialNumber', serialNumber);
                    const swData = await this.axiosInstance.get(portsUrl);
                    const debug1 = debugLog ? this.emit('debug', `${prefixName}, data: ${JSON.stringify(swData.data, null, 2)}`) : false;

                    //check device state
                    this.emit('checkDeviceState', swData, prefixName, serialNumber, hideUplinks, prefixForPortName, enablePoePortsControl, enableSensorPorts);
                };

            } catch (error) {
                this.emit('error', `check switch data error: ${error}.`);
                this.checkDeviceInfo();
            };
        }).on('checkDeviceState', (swData, prefixName, serialNumber, hideUplinks, prefixForPortName, enablePoePortsControl, enableSensorPorts) => {
            try {
                const debug = debugLog ? this.emit('debug', `requesting ports status.`) : false;
                const portsPrefixNames = [];
                const portsSn = [];
                const portsId = [];
                const portsName = [];
                const portsPrefix = [];
                const portsState = [];
                const portsPoeState = [];
                const portsPoeControlEnable = [];
                const portsSensorsEnable = [];

                for (const port of swData.data) {
                    const portId = port.portId;
                    const portName = port.name;
                    const portState = port.enabled;
                    const portPoeState = port.poeEnabled;
                    const hideUplinksPorts = hideUplinks && portName.substr(0, 6) === 'Uplink';
                    const hidePortByName = swHidenPortsByName.includes(portName);

                    //push exposed ports to array
                    if (!hideUplinksPorts && !hidePortByName) {
                        portsPrefixNames.push(prefixName);
                        portsSn.push(serialNumber);
                        portsId.push(portId);
                        portsName.push(portName);
                        portsPrefix.push(prefixForPortName);
                        portsState.push(portState);
                        portsPoeState.push(portPoeState);
                        portsPoeControlEnable.push(enablePoePortsControl);
                        portsSensorsEnable.push(enableSensorPorts);
                    }
                };
                const portsCount = portsState.length;
                const debug1 = debugLog ? this.emit('debug', `${prefixName}, found: ${portsCount} exposed ports.`) : false;

                if (portsCount === 0) {
                    return;
                }

                //emit device info if not in devices array
                if (!switchesArray.includes(serialNumber)) {
                    this.emit('deviceInfo', prefixName, serialNumber, portsCount);
                    switchesArray.push(serialNumber);
                }

                //emit device state
                this.emit('deviceState', prefixName, serialNumber, portsPrefixNames, portsSn, portsId, portsName, portsPrefix, portsState, portsPoeState, portsPoeControlEnable, portsSensorsEnable, portsCount);
                this.checkDeviceInfo();
            } catch (error) {
                this.emit('error', `check port status error: ${error}.`);
                this.checkDeviceInfo();
            };
        });

        this.emit('checkDeviceInfo');
    };

    async checkDeviceInfo() {
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
module.exports = MerakiMs;
