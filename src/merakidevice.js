'use strict';
const MerakiDb = require('./merakidb.js');
const MerakiMr = require('./merakimr.js');
const MerakiMs = require('./merakims.js');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');
let Accessory, Characteristic, Service, Categories, UUID;

class MerakiDevice extends EventEmitter {
    constructor(api, config) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        UUID = api.hap.uuid;

        //network configuration
        this.host = config.host;
        this.name = config.name;
        this.apiKey = config.apiKey;
        this.organizationId = config.organizationId;
        this.networkId = config.networkId;
        this.dashboardClientsControl = config.dashboardClientsControl || false;
        this.dashboardClientsPrefixForClientName = config.enablePrefixForClientName || false;
        this.dashboardClientsSensor = config.enableSonsorClients || false;
        this.dashboardClientsPolicy = config.dashboardClientsPolicy || [];
        this.accessPointsControl = config.accessPointsControl || false;
        this.accessPointsHideUnconfiguredSsids = config.hideUnconfiguredSsids || false;
        this.accessPointsPrefixForSsidsName = config.enablePrefixForSsidsName || false;
        this.accessPointsHideSsidsByName = config.hideSsids || [];
        this.accessPointsSsidsSensor = config.enableSonsorSsids || false;
        this.switchesControl = config.switchesControl || false;
        this.switches = config.switches || [];
        this.refreshInterval = config.refreshInterval || 5;
        this.enableDebugMode = config.enableDebugMode || false;
        this.disableLogInfo = config.disableLogInfo || false;
        this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;

        //devices variables
        this.dbClientsCount = 0;
        this.mrSsidsCount = 0;
        this.msPortsCount = 0;
        this.prepareDb = true;
        this.prepareMr = true;
        this.switchesArray = [];

        if (this.dashboardClientsControl) {
            this.merakiDb = new MerakiDb({
                host: this.host,
                apiKey: this.apiKey,
                networkId: this.networkId,
                clientsPolicy: this.dashboardClientsPolicy,
                debugLog: this.enableDebugMode,
                refreshInterval: this.refreshInterval,
            });

            this.merakiDb.on('deviceInfo', (clientsCount) => {
                //meraki info
                if (!this.disableLogDeviceInfo) {
                    this.emit('devInfo', `---- Dashboard ----`);
                    this.emit('devInfo', `Manufacturer: Cisco/Meraki`);
                    this.emit('devInfo', `Network: ${this.name}`);
                    this.emit('devInfo', `Network Id: ${this.networkId}`);
                    this.emit('devInfo', `Organization Id: ${this.organizationId}`);
                    this.emit('devInfo', `Exposed Clients: ${clientsCount}`);
                    this.emit('devInfo', `----------------------------------`)
                };
            }).on('deviceState', async (exposedClients, clientsCount) => {
                this.dbExposedClients = exposedClients;
                this.dbClientsCount = clientsCount;

                for (let i = 0; i < clientsCount; i++) {
                    const state = exposedClients[i].policyState;
                    if (this.dbServices) {
                        this.dbServices[i].updateCharacteristic(Characteristic.On, state);
                    }

                    if (this.dbSensorServices && this.dashboardClientsSensor) {
                        this.dbSensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1)
                    };
                }

                //start prepare accessory
                if (this.prepareDb) {
                    try {
                        const accessory = await this.prepareAccessory(0, 'Dashboard', this.organizationId);
                        this.emit('publishAccessory', accessory, 'Dashboard');
                        this.prepareDb = false;
                    } catch (error) {
                        this.emit('error', `Dasshboard, prepare accessory error: ${error}`);
                    };
                };
            })
                .on('message', (message) => {
                    this.emit('message', message);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                });
        };

        if (this.accessPointsControl) {
            this.merakiMr = new MerakiMr({
                host: this.host,
                apiKey: this.apiKey,
                networkId: this.networkId,
                hideUnconfiguredSsid: this.accessPointsHideUnconfiguredSsids,
                hideSsidsName: this.accessPointsHideSsidsByName,
                debugLog: this.enableDebugMode,
                refreshInterval: this.refreshInterval,
            });

            this.merakiMr.on('deviceInfo', (ssidsCount) => {
                //meraki info
                if (!this.disableLogDeviceInfo) {
                    this.emit('devInfo', `---- Access Point ----`);
                    this.emit('devInfo', `Manufacturer: Cisco/Meraki`);
                    this.emit('devInfo', `Network: ${this.name}`);
                    this.emit('devInfo', `Network Id: ${this.networkId}`);
                    this.emit('devInfo', `Organization Id: ${this.organizationId}`);
                    this.emit('devInfo', `Exposed SSIDs: ${ssidsCount}`);
                    this.emit('devInfo', `----------------------------------`)
                };
            }).on('deviceState', async (exposedSsids, ssidsCount) => {
                this.mrExposedSsids = exposedSsids;
                this.mrSsidsCount = ssidsCount;

                //update characteristics of exposed ssids
                for (let i = 0; i < ssidsCount; i++) {
                    const state = exposedSsids[i].state;
                    if (this.mrServices) {
                        this.mrServices[i].updateCharacteristic(Characteristic.On, state);
                    };

                    if (this.mrSensorServices && this.accessPointsSsidsSensor) {
                        this.mrSensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1)
                    };
                }

                //start prepare accessory
                if (this.prepareMr) {
                    try {
                        const accessory = await this.prepareAccessory(1, 'Access Point', this.networkId);
                        this.emit('publishAccessory', accessory, 'Access Points');
                        this.prepareMr = false;
                    } catch (error) {
                        this.emit('error', `Access Points, prepare accessory error: ${error}`);
                    };
                };
            })
                .on('message', (message) => {
                    this.emit('message', message);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                });
        };

        if (this.switchesControl) {
            this.merakiMs = new MerakiMs({
                host: this.host,
                apiKey: this.apiKey,
                switches: this.switches,
                debugLog: this.enableDebugMode,
                refreshInterval: this.refreshInterval,
            });

            this.merakiMs.on('deviceInfo', (swName, swSerialNumber, portsCount) => {
                //meraki info
                if (!this.disableLogDeviceInfo) {
                    this.emit('devInfo', `---- ${swName}: ${swSerialNumber} ----`);
                    this.emit('devInfo', `Manufacturer: Cisco/Meraki`);
                    this.emit('devInfo', `Network: ${this.name}`);
                    this.emit('devInfo', `Network Id: ${this.networkId}`);
                    this.emit('devInfo', `Organization Id: ${this.organizationId}`);
                    this.emit('devInfo', `Exposed Ports: ${portsCount}`);
                    this.emit('devInfo', `----------------------------------`)
                };
            }).on('deviceState', async (swName, swSerialNumber, exposedPorts, portsCount) => {
                this.msExposedPorts = exposedPorts;
                this.msPortsCount = portsCount;

                //update characteristics of exposed ports
                for (let i = 0; i < portsCount; i++) {
                    const state = exposedPorts[i].state;
                    const sensorEnable = exposedPorts[i].sensorsEnable;
                    if (this.msServices) {
                        this.msServices[i].updateCharacteristic(Characteristic.On, state);
                    };

                    if (this.msSensorServices && sensorEnable) {
                        this.msSensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1)
                    };
                };

                //start prepare accessory
                if (!this.switchesArray.includes(swSerialNumber)) {
                    try {
                        const accessory = await this.prepareAccessory(2, swName, swSerialNumber);
                        this.emit('publishAccessory', accessory, swName);
                    } catch (error) {
                        this.emit('error', `${swName}, prepare accessory error: ${error}`);
                    };
                    this.switchesArray.push(swSerialNumber);
                }
            })
                .on('message', (message) => {
                    this.emit('message', message);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                });
        };
    };

    //Prepare accessory
    prepareAccessory(deviceType, deviceName, accessoryUuid) {
        return new Promise((resolve, reject) => {
            try {
                //prepare accessory
                const debug = !this.enableDebugMode ? false : this.emit('debug', `${deviceName}, prepare accessory`);
                const accessoryName = deviceName;
                const accessoryUUID = UUID.generate(accessoryUuid);
                const accessoryCategory = Categories.AIRPORT;
                const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

                //prepare information service
                const debug1 = !this.enableDebugMode ? false : this.emit('debug', `${accessoryName}, prepare information service`);
                accessory.getService(Service.AccessoryInformation)
                    .setCharacteristic(Characteristic.Manufacturer, 'Cisco/Meraki')
                    .setCharacteristic(Characteristic.Model, accessoryName)
                    .setCharacteristic(Characteristic.SerialNumber, this.networkId)
                    .setCharacteristic(Characteristic.FirmwareRevision, this.organizationId);

                //meraki devices
                switch (deviceType) {
                    case 0: //dashboard clients
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `${accessoryName}, prepare meraki service`);
                        const exposedClients = this.dbExposedClients;

                        this.dbServices = [];
                        this.dbSensorServices = [];
                        let i = 0;
                        for (const client of exposedClients) {
                            const dbClientName = client.name;
                            const dbServiceName = this.dashboardClientsPrefixForClientName ? `C.${dbClientName}` : dbClientName;
                            const dbClientPolicyService = new Service.Outlet(dbServiceName, `dbClientPolicyService${i}`);
                            dbClientPolicyService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            dbClientPolicyService.setCharacteristic(Characteristic.ConfiguredName, `${dbServiceName}`);
                            dbClientPolicyService.getCharacteristic(Characteristic.On)
                                .onGet(async () => {
                                    const state = client.policyState ?? false;
                                    const policy = state ? client.policyType : 'Blocked';
                                    const logInfo = this.disableLogInfo ? false : this.emit('message', `${accessoryName}, Client: ${dbClientName}, Policy: ${policy}`);
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        const policy = state ? client.policyType : 'Blocked';
                                        const policyUrl = `${CONSTANS.ApiUrls.DbClients.replace('networkId', this.networkId)}/${client.id}/policy`;
                                        const policyData = {
                                            'devicePolicy': policy
                                        }
                                        await this.merakiDb.send(policyUrl, policyData);
                                        const logInfo = this.disableLogInfo ? false : this.emit('message', `${accessoryName}, Client: ${dbClientName}, Policy: ${policy}`);
                                    } catch (error) {
                                        this.emit('error', `${accessoryName}, Client: ${dbClientName}, set Policy error: ${error}`);
                                    }
                                });

                            this.dbServices.push(dbClientPolicyService);
                            accessory.addService(this.dbServices[i]);

                            if (this.dashboardClientsSensor) {
                                const debug = !this.enableDebugMode && i > 0 ? false : this.emit('debug', `${accessoryName}, prepare meraki sensor service`);
                                const dbSensorServiceName = this.dashboardClientsPrefixForClientName ? `Sensor C.${dbClientName}` : `Sensor ${dbClientName}`;
                                const dbSensorService = new Service.ContactSensor(dbSensorServiceName, `Client Sensor${i}`);
                                dbSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                dbSensorService.setCharacteristic(Characteristic.ConfiguredName, `${dbSensorServiceName}`);
                                dbSensorService.getCharacteristic(Characteristic.ContactSensorState)
                                    .onGet(async () => {
                                        const state = client.policyState ?? false;
                                        return state;
                                    });

                                this.dbSensorServices.push(dbSensorService);
                                accessory.addService(this.dbSensorServices[i]);
                            };
                            i++;
                        };

                        resolve(accessory);
                        break;
                    case 1: //network ssids
                        const debug1 = !this.enableDebugMode ? false : this.emit('debug', `${accessoryName}, prepare meraki service`);
                        const exposedSsids = this.mrExposedSsids;

                        this.mrServices = [];
                        this.mrSensorServices = [];
                        let j = 0;
                        for (const ssid of exposedSsids) {
                            const ssidName = ssid.name;
                            const mrServiceName = this.accessPointsPrefixForSsidsName ? `W.${ssidName}` : ssidName;
                            const mrService = new Service.Outlet(mrServiceName, `mrService${j}`);
                            mrService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            mrService.setCharacteristic(Characteristic.ConfiguredName, `${mrServiceName}`);
                            mrService.getCharacteristic(Characteristic.On)
                                .onGet(async () => {
                                    const state = ssid.state ?? false;
                                    const logInfo = this.disableLogInfo ? false : this.emit('message', `${accessoryName}, SSID: ${ssidName}, state: ${state ? 'Enabled' : 'Disabled'}`);
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        state = state ? true : false;
                                        const mrUrl = `${CONSTANS.ApiUrls.MrSsids.replace('networkId', this.networkId)}/${ssid.number}`;
                                        const mrData = {
                                            'enabled': state
                                        };
                                        await this.merakiMr.send(mrUrl, mrData);
                                        const logInfo = this.disableLogInfo ? false : this.emit('message', `${accessoryName}, SSID: ${ssidName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                                    } catch (error) {
                                        this.emit('error', `${accessoryName}, SSID: ${ssidName}, set state error: ${error}`);
                                    }
                                });

                            this.mrServices.push(mrService);
                            accessory.addService(this.mrServices[j]);

                            if (this.accessPointsSsidsSensor) {
                                const debug = !this.enableDebugMode && j > 0 ? false : this.emit('debug', `${accessoryName}, prepare meraki sensor service`);
                                const mrSensorServiceName = this.accessPointsPrefixForSsidsName ? `Sensor W.${ssidName}` : `Sensor ${ssidName}`;
                                const mrSensorService = new Service.ContactSensor(mrSensorServiceName, `Ssid Sensor${j}`);
                                mrSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                mrSensorService.setCharacteristic(Characteristic.ConfiguredName, `${mrSensorServiceName}`);
                                mrSensorService.getCharacteristic(Characteristic.ContactSensorState)
                                    .onGet(async () => {
                                        const state = ssid.state ?? false;
                                        return state;
                                    });
                                this.mrSensorServices.push(mrSensorService);
                                accessory.addService(this.mrSensorServices[j]);
                            };
                            j++;
                        };

                        resolve(accessory);
                        break;
                    case 2: ///switches
                        const debug2 = !this.enableDebugMode ? false : this.emit('debug', `${accessoryName}, prepare meraki service`);
                        const exposedPorts = this.msExposedPorts;

                        this.msServices = [];
                        this.msSensorServices = [];
                        let k = 0;
                        for (const port of exposedPorts) {
                            const msPortPrefixEnable = port.prefixEnable;
                            const msPortName = port.name;
                            const msPortId = port.id;
                            const msPortsPoeControlEnable = port.poeControlEnable;
                            const msServiceName = msPortPrefixEnable ? `${msPortId}.${msPortName}` : msPortName;
                            const msService = new Service.Outlet(msServiceName, `msService${k}`);
                            msService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            msService.setCharacteristic(Characteristic.ConfiguredName, `${msServiceName}`);
                            msService.getCharacteristic(Characteristic.On)
                                .onGet(async () => {
                                    const state = port.state ?? false;
                                    const logInfo = this.disableLogInfo ? false : this.emit('message', `${accessoryName}, Port: ${msPortId}, Name: ${msPortName}, State: ${state ? 'Enabled' : 'Disabled'}`);
                                    return state;
                                })
                                .onSet(async (state) => {
                                    try {
                                        state = state ? true : false;
                                        const switchPortUrl = `/devices/${port.swSerialNumber}/switch/ports/${msPortId}`;
                                        const switchPortData = msPortsPoeControlEnable ? {
                                            'enabled': state,
                                            'poeEnabled': state
                                        } : {
                                            'enabled': state
                                        };
                                        await this.merakiMs.send(switchPortUrl, switchPortData);
                                        const logInfo = this.disableLogInfo ? false : this.emit('message', `${accessoryName}, Port: ${msPortId}, Name: ${msPortName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                                    } catch (error) {
                                        this.emit('error', `${accessoryName}, Port: ${msPortId}, Name: ${msPortName}, set state error: %${error}`);
                                    }
                                });

                            this.msServices.push(msService);
                            accessory.addService(this.msServices[k]);

                            if (port.sensorsEnable) {
                                const debug = !this.enableDebugMode && k > 0 ? false : this.emit('debug', `${accessoryName}, prepare meraki sensor service`);
                                const msSensorServiceName = msPortPrefixEnable ? `Sensor ${msPortId}.${msPortName}` : `Sensor ${msPortName}`;
                                const msSensorService = new Service.ContactSensor(msSensorServiceName, `Port Sensor${k}`);
                                msSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                msSensorService.setCharacteristic(Characteristic.ConfiguredName, `${msSensorServiceName}`);
                                msSensorService.getCharacteristic(Characteristic.ContactSensorState)
                                    .onGet(async () => {
                                        const state = port.state;
                                        return state;
                                    });
                                this.msSensorServices.push(msSensorService);
                                accessory.addService(this.msSensorServices[k]);
                            };
                            k++;
                        };

                        resolve(accessory);
                        break;
                }
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MerakiDevice;
