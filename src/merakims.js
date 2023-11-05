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

        const configuredSwitches = [];
        const exposedSwitches = [];
        const swHidenPortsByName = [];

        for (const sw of switches) {
            if (sw.serialNumber && sw.mode) {
                configuredSwitches.push(sw);

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
                for (const confSwitch of configuredSwitches) {
                    const swName = confSwitch.name;
                    const serialNumber = confSwitch.serialNumber;

                    //get data of switch
                    const portsUrl = CONSTANS.ApiUrls.MsPorts.replace('serialNumber', serialNumber);
                    const swData = await this.axiosInstance.get(portsUrl);
                    const debug1 = debugLog ? this.emit('debug', `${swName}, data: ${JSON.stringify(swData.data, null, 2)}`) : false;

                    //check device state
                    this.emit('checkDeviceState', confSwitch, swData.data);
                };

            } catch (error) {
                this.emit('error', `check switch data error: ${error}.`);
                this.refreshData();
            };
        }).on('checkDeviceState', (confSwitch, swData) => {
            try {
                const debug = debugLog ? this.emit('debug', `requesting ports status.`) : false;
                const swName = confSwitch.name;
                const swSerialNumber = confSwitch.serialNumber;
                const swHideUplinksPorts = confSwitch.hideUplinkPorts;
                const swPrefixForPortsName = confSwitch.enablePrefixForPortName;
                const swPoeControlEnable = confSwitch.enablePoePortsControl;
                const swSensorsEnable = confSwitch.enableSensorPorts;

                const exposedPorts = [];
                for (const port of swData) {
                    const hideUplinksPorts = swHideUplinksPorts && port.name.substr(0, 6) === 'Uplink';
                    const hidePortByName = swHidenPortsByName.includes(port.name);

                    //push exposed ports to array
                    if (!hideUplinksPorts && !hidePortByName) {
                        const obj = {
                            'swName': swName,
                            'swSrialNumber': swSerialNumber,
                            'prefixEnable': swPrefixForPortsName,
                            'id': port.portId,
                            'name': port.name,
                            'state': port.enabled,
                            'poeState': port.poeEnabled,
                            'poeControlEnable': swPoeControlEnable,
                            'sensorsEnable': swSensorsEnable
                        };
                        exposedPorts.push(obj);
                    }
                };
                const portsCount = exposedPorts.length;
                const debug1 = debugLog ? this.emit('debug', `${swName}, found: ${portsCount} exposed ports.`) : false;

                if (portsCount === 0) {
                    return;
                }

                //emit device info if not in devices array
                if (!exposedSwitches.includes(swSerialNumber)) {
                    this.emit('deviceInfo', swName, swSerialNumber, portsCount);
                    exposedSwitches.push(swSerialNumber);
                }

                //emit device state
                this.emit('deviceState', swName, swSerialNumber, exposedPorts, portsCount);
                this.refreshData();
            } catch (error) {
                this.emit('error', `check port status error: ${error}.`);
                this.refreshData();
            };
        });

        this.emit('checkDeviceInfo');
    };

    async refreshData() {
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
