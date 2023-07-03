'use strict';
const MerakiDb = require('./merakidb.js');
const MerakiMr = require('./merakimr.js');
const MerakiMs = require('./merakims.js');
const EventEmitter = require('events');
let Accessory, Characteristic, Service, Categories, UUID;

class MerakiDevice extends EventEmitter {
    constructor(api, prefDir, config) {
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

        //meraki url
        this.organizationsIdUrl = `/organizations`;
        this.networksIdUrl = `/organizations/${this.organizationId}/networks`;
        this.networkUrl = `/networks/${this.networkId}`;
        this.devicesUrl = `/organizations/${this.organizationId}/devices`;
        this.dashboardClientsUrl = `/networks/${this.networkId}/clients`;
        this.mrlianceUrl = `/networks/${this.networkId}/appliance/ports`;
        this.wirelessUrl = `/networks/${this.networkId}/wireless/ssids`;

        //devices variables
        this.dbClientsCount = 0;
        this.mrSsidsCount = 0;
        this.msPortsCount = 0;

        //meraki dashboard
        if (this.dashboardClientsControl) {
            this.merakiDb = new MerakiDb({
                host: this.host,
                apiKey: this.apiKey,
                networkId: this.networkId,
                clientsPolicy: this.dashboardClientsPolicy,
                debugLog: this.enableDebugMode,
                refreshInterval: this.refreshInterval,
            });

            this.merakiDb.on('data', (confClientsPolicyName, confClientsPolicyType, clientsPolicyId, clientsPolicyMac, clientsPolicyPolicy, clientsPolicyState, clientsCount) => {
                this.dbConfClientsPolicyName = confClientsPolicyName;
                this.dbConfClientsPolicyType = confClientsPolicyType;

                this.dbClientsPolicyId = clientsPolicyId;
                this.dbClientsPolicyMac = clientsPolicyMac;
                this.dbClientsPolicyPolicy = clientsPolicyPolicy;
                this.dbClientsPolicyState = clientsPolicyState;
                this.dbClientsCount = clientsCount;

                for (let i = 0; i < clientsCount; i++) {
                    const state = clientsPolicyState[i];
                    if (this.dbServices) {
                        this.dbServices[i].updateCharacteristic(Characteristic.On, state);
                    }

                    if (this.dbSensorServices) {
                        this.dbSensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1)
                    };
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

        //meraki mr
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

            this.merakiMr.on('data', (mrSsidsNumber, mrSsidsName, mrSsidsState, mrSsidsCount) => {
                this.mrSsidsNumber = mrSsidsNumber;
                this.mrSsidsName = mrSsidsName;
                this.mrSsidsState = mrSsidsState;
                this.mrSsidsCount = mrSsidsCount;

                //update characteristics of exposed ssids
                for (let i = 0; i < mrSsidsCount; i++) {
                    const state = mrSsidsState[i];
                    if (this.mrServices) {
                        this.mrServices[i].updateCharacteristic(Characteristic.On, state);
                    };

                    if (this.mrSensorServices) {
                        this.mrSensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1)
                    };
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
        }

        //meraki ms
        if (this.switchesControl) {
            this.merakiMs = new MerakiMs({
                host: this.host,
                apiKey: this.apiKey,
                switches: this.switches,
                debugLog: this.enableDebugMode,
                refreshInterval: this.refreshInterval,
            });

            this.merakiMs.on('data', (msPortsSn, msPortsId, msPortsName, msPortsPrefix, msPortsState, msPortsPoeState, msPortsSensorsEnable, msPortsCount) => {
                this.msPortsSn = msPortsSn;
                this.msPortsId = msPortsId;
                this.msPortsName = msPortsName;
                this.msPortsPrefix = msPortsPrefix;
                this.msPortsState = msPortsState;
                this.msPortsPoeState = msPortsPoeState;
                this.msPortsSensorsEnable = msPortsSensorsEnable;
                this.msPortsCount = msPortsCount;

                //update characteristics of exposed ports
                for (let i = 0; i < msPortsCount; i++) {
                    const state = msPortsState[i];
                    if (this.msServices) {
                        this.msServices[i].updateCharacteristic(Characteristic.On, state);
                    };

                    if (this.msSensorServices) {
                        this.msSensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1)
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

        this.start();
    };

    async start() {
        try {
            await new Promise(resolve => setTimeout(resolve, 2500));
            if (this.dbClientsCount === 0 && this.mrSsidsCount == 0 && this.msPortsCount === 0) {
                this.emit('message', `not found configured devices.`)
                return;
            };

            //meraki info
            if (!this.disableLogDeviceInfo) {
                this.emit('devInfo', `-------- ${this.name} --------`);
                this.emit('devInfo', `Manufacturer: Cisco/Meraki`);
                this.emit('devInfo', `Network: ${this.name}`);
                this.emit('devInfo', `Network Id: ${this.networkId}`);
                this.emit('devInfo', `Organization Id: ${this.organizationId}`);
                this.emit('devInfo', `----------------------------------`)
            };

            //prepare accessory
            const accessory = await this.prepareAccessory();
            this.emit('publishAccessory', accessory)
        } catch (error) {
            this.emit('error', `prepare accessory error: ${error}.`);
        };
    };

    //Prepare accessory
    prepareAccessory() {
        return new Promise((resolve, reject) => {
            try {
                //prepare accessory
                const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare accessory`);
                const accessoryName = this.name;
                const accessoryUUID = UUID.generate(this.networkId);
                const accessoryCategory = Categories.AIRPORT;
                const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

                //prepare information service
                const debug1 = !this.enableDebugMode ? false : this.emit('debug', `Prepare information service`);
                accessory.getService(Service.AccessoryInformation)
                    .setCharacteristic(Characteristic.Manufacturer, 'Cisco/Meraki')
                    .setCharacteristic(Characteristic.Model, accessoryName)
                    .setCharacteristic(Characteristic.SerialNumber, this.networkId)
                    .setCharacteristic(Characteristic.FirmwareRevision, this.organizationId);

                //devices variable
                const dbExposedClientsCount = this.dbClientsCount;
                const mrExposedSsidsCount = this.mrSsidsCount;
                const msExposedPortsCount = this.msPortsCount;

                //meraki db
                if (this.dashboardClientsControl && dbExposedClientsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare meraki db service`);

                    this.dbServices = [];
                    for (let i = 0; i < dbExposedClientsCount; i++) {
                        const dbClientName = this.dbConfClientsPolicyName[i];
                        const dbServiceName = this.dashboardClientsPrefixForClientName ? `C.${dbClientName}` : dbClientName;
                        const dbClientPolicyService = new Service.Outlet(dbServiceName, `dbClientPolicyService${i}`);
                        dbClientPolicyService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        dbClientPolicyService.setCharacteristic(Characteristic.ConfiguredName, `${dbServiceName}`);
                        dbClientPolicyService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.dbClientsPolicyState[i];
                                const policy = state ? this.dbClientsPolicyPolicy[i] : 'Blocked';
                                const logInfo = this.disableLogInfo ? false : this.emit('message', `Client: % ${dbClientName}, Policy: ${policy}`);
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    const policy = state ? this.dbConfClientsPolicyType[i] : 'Blocked';
                                    const policyUrl = `${this.dashboardClientsUrl}/${this.dbClientsPolicyId[i]}/policy`;
                                    const policyData = {
                                        'devicePolicy': policy
                                    }
                                    await this.merakiDb.send(policyUrl, policyData);
                                    const logInfo = this.disableLogInfo ? false : this.emit('message', `Client: % ${dbClientName}, Policy: ${policy}`);
                                } catch (error) {
                                    this.emit('error', `Client: ${dbClientName}, set Policy error: ${error}`);
                                }
                            });

                        this.dbServices.push(dbClientPolicyService);
                        accessory.addService(this.dbServices[i]);
                    };

                    if (this.dashboardClientsSensor) {
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare meraki db sensor service`);

                        this.dbSensorServices = [];
                        for (let i = 0; i < mrExposedSsidsCount; i++) {
                            const dbClientName = this.dbConfClientsPolicyName[i];
                            const dbSensorServiceName = this.dashboardClientsPrefixForClientName ? `Sensor C.${dbClientName}` : `Sensor ${dbClientName}`;
                            const dbSensorService = new Service.ContactSensor(dbSensorServiceName, `Client Sensor${i}`);
                            dbSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            dbSensorService.setCharacteristic(Characteristic.ConfiguredName, `${dbSensorServiceName}`);
                            dbSensorService.getCharacteristic(Characteristic.ContactSensorState)
                                .onGet(async () => {
                                    const state = this.dbClientsPolicyState[i];
                                    return state;
                                });

                            this.dbSensorServices.push(dbSensorService);
                            accessory.addService(this.dbSensorServices[i]);
                        };
                    };
                };

                //meraki mr
                if (this.accessPointsControl && mrExposedSsidsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare meraki mr service`);

                    this.mrServices = [];
                    for (let i = 0; i < mrExposedSsidsCount; i++) {
                        const ssidName = this.mrSsidsName[i];
                        const mrServiceName = this.accessPointsPrefixForSsidsName ? `W.${ssidName}` : ssidName;
                        const mrService = new Service.Outlet(mrServiceName, `mrService${i}`);
                        mrService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        mrService.setCharacteristic(Characteristic.ConfiguredName, `${mrServiceName}`);
                        mrService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.mrSsidsState[i] ?? false;
                                const logInfo = this.disableLogInfo ? false : this.emit('message', `SSID: ${ssidName}, state: ${state ? 'Enabled' : 'Disabled'}`);
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    state = state ? true : false;
                                    const mrUrl = `${this.wirelessUrl}/${this.mrSsidsNumber[i]}`;
                                    const mrData = {
                                        'enabled': state
                                    };
                                    await this.merakiMr.send(mrUrl, mrData);
                                    const logInfo = this.disableLogInfo ? false : this.emit('message', `SSID: ${ssidName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                                } catch (error) {
                                    this.emit('error', `SSID: ${ssidName}, set state error: ${error}`);
                                }
                            });

                        this.mrServices.push(mrService);
                        accessory.addService(this.mrServices[i]);
                    };

                    if (this.accessPointsSsidsSensor) {
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare meraki mr sensor service`);

                        this.mrSensorServices = [];
                        for (let i = 0; i < mrExposedSsidsCount; i++) {
                            const ssidName = this.mrSsidsName[i];
                            const mrSensorServiceName = this.accessPointsPrefixForSsidsName ? `Sensor W.${ssidName}` : `Sensor ${ssidName}`;
                            const mrSensorService = new Service.ContactSensor(mrSensorServiceName, `Ssid Sensor${i}`);
                            mrSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                            mrSensorService.setCharacteristic(Characteristic.ConfiguredName, `${mrSensorServiceName}`);
                            mrSensorService.getCharacteristic(Characteristic.ContactSensorState)
                                .onGet(async () => {
                                    const state = this.mrSsidsState[i];
                                    return state;
                                });
                            this.mrSensorServices.push(mrSensorService);
                            accessory.addService(this.mrSensorServices[i]);
                        };
                    };
                };

                //meraki ms
                if (this.switchesControl && msExposedPortsCount > 0) {
                    const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare meraki ms service`);

                    this.msServices = [];
                    for (let i = 0; i < msExposedPortsCount; i++) {
                        const msPortName = this.msPortsName[i];
                        const msServiceName = this.msPortsPrefix[i] ? `${this.msPortsId[i]}.${msPortName}` : msPortName;
                        const msService = new Service.Outlet(msServiceName, `msService${i}`);
                        msService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                        msService.setCharacteristic(Characteristic.ConfiguredName, `${msServiceName}`);
                        msService.getCharacteristic(Characteristic.On)
                            .onGet(async () => {
                                const state = this.msPortsState[i] ?? false;
                                const logInfo = this.disableLogInfo ? false : this.emit('message', `Port: ${this.msPortsId[i]}, Name: ${msPortName}, state: ${state ? 'Enabled' : 'Disabled'}`);
                                return state;
                            })
                            .onSet(async (state) => {
                                try {
                                    state = state ? true : false;
                                    const switchPortUrl = `/devices/${this.msPortsSn[i]}/switch/ports/${this.msPortsId[i]}`;
                                    const switchPortData = {
                                        'enabled': state
                                    };
                                    await this.merakiMs.send(switchPortUrl, switchPortData);
                                    const logInfo = this.disableLogInfo ? false : this.emit('message', `Port: ${this.msPortsId[i]}, Name: ${msPortName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                                } catch (error) {
                                    this.emit('error', `Port: ${this.msPortsId[i]}, Name: ${msPortName}, set state error: %${error}`);
                                }
                            });

                        this.msServices.push(msService);
                        accessory.addService(this.msServices[i]);
                    };

                    const sensorEnabled = this.msPortsSensorsEnable.includes(true);
                    if (sensorEnabled) {
                        const debug = !this.enableDebugMode ? false : this.emit('debug', `Prepare meraki ms sensor service`);

                        this.msSensorServices = [];
                        for (let i = 0; i < msExposedPortsCount; i++) {
                            if (this.msPortsSensorsEnable[i]) {
                                const msPortName = this.msPortsName[i];
                                const msSensorServiceName = this.msPortsPrefix[i] ? `Sensor ${this.msPortsId[i]}.${msPortName}` : `Sensor ${msPortName}`;
                                const msSensorService = new Service.ContactSensor(msSensorServiceName, `Port Sensor${i}`);
                                msSensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                                msSensorService.setCharacteristic(Characteristic.ConfiguredName, `${msSensorServiceName}`);
                                msSensorService.getCharacteristic(Characteristic.ContactSensorState)
                                    .onGet(async () => {
                                        const state = this.msPortsState[i];
                                        return state;
                                    });
                                this.msSensorServices.push(msSensorService);
                                accessory.addService(this.msSensorServices[i]);
                            };
                        };
                    };
                };

                resolve(accessory);
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MerakiDevice;
