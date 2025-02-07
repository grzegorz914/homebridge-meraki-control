import MerakiMr from './merakimr.js';
import EventEmitter from 'events';
import { ApiUrls } from './constants.js';
let Accessory, Characteristic, Service, Categories, AccessoryUUID;

class MerakiDevice extends EventEmitter {
    constructor(api, config, deviceName, deviceUuid, deviceData) {
        super();

        Accessory = api.platformAccessory;
        Characteristic = api.hap.Characteristic;
        Service = api.hap.Service;
        Categories = api.hap.Categories;
        AccessoryUUID = api.hap.uuid;

        //meraki configuration
        this.networkName = config.name;
        this.organizationId = config.organizationId;
        this.networkId = config.networkId;

        //system configuration
        this.host = config.host;
        this.apiKey = config.apiKey;
        this.deviceName = deviceName;
        this.deviceUuid = deviceUuid;
        this.deviceData = deviceData;
        this.refreshInterval = config.refreshInterval * 1000 || 5000;
        this.enableDebugMode = config.enableDebugMode || false;
        this.disableLogInfo = config.disableLogInfo || false;
        this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;

        //variables
        this.startPrepareAccessory = true;
        this.prefixForSsidName = config.enablePrefixForSsidsName || false;
        this.ssidsSensor = config.enableSonsorSsids || false;
        this.hideUnconfiguredSsids = config.hideUnconfiguredSsids || false;
    };

    async startImpulseGenerator() {
        try {
            //start impulse generator 
            await this.merakiMr.impulseGenerator.start([{ name: 'checkDeviceInfo', sampling: this.refreshInterval }]);
            return true;
        } catch (error) {
            throw new Error(`Impulse generator start error: ${error}`);
        };
    }

    //prepare accessory
    async prepareAccessory() {
        try {
            //prepare accessory
            const debug = !this.enableDebugMode ? false : this.emit('debug', `prepare accessory`);
            const accessoryName = this.deviceName;
            const accessoryUUID = AccessoryUUID.generate(this.deviceUuid);
            const accessoryCategory = Categories.AIRPORT;
            const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

            //prepare information service
            const debug1 = !this.enableDebugMode ? false : this.emit('debug', `prepare information service`);
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, 'Cisco Meraki')
                .setCharacteristic(Characteristic.Model, accessoryName)
                .setCharacteristic(Characteristic.SerialNumber, this.networkId)
                .setCharacteristic(Characteristic.FirmwareRevision, this.organizationId)
                .setCharacteristic(Characteristic.ConfiguredName, accessoryName);

            const debug2 = !this.enableDebugMode ? false : this.emit('debug', `prepare meraki service`);
            const exposedSsids = this.exposedSsids;

            //device
            this.services = [];
            this.sensorServices = [];
            for (const ssid of exposedSsids) {
                const ssidName = ssid.name;
                const serviceName = this.prefixForSsidName ? `W.${ssidName}` : ssidName;
                const service = accessory.addService(Service.Outlet, serviceName, `Ssid Service ${ssidName}`);
                service.addOptionalCharacteristic(Characteristic.ConfiguredName);
                service.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                service.getCharacteristic(Characteristic.On)
                    .onGet(async () => {
                        const state = ssid.state ?? false;
                        const logInfo = this.disableLogInfo ? false : this.emit('message', `SSID: ${ssidName}, state: ${state ? 'Enabled' : 'Disabled'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            state = state ? true : false;
                            const url = `${ApiUrls.MrSsids.replace('networkId', this.networkId)}/${ssid.number}`;
                            const data = {
                                'enabled': state
                            };
                            await this.merakiMr.send(url, data);
                            const logInfo = this.disableLogInfo ? false : this.emit('message', `SSID: ${ssidName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                        } catch (error) {
                            this.emit('warn', `SSID: ${ssidName}, set state error: ${error}`);
                        }
                    });
                this.services.push(service);

                if (this.ssidsSensor) {
                    const debug = !this.enableDebugMode && j > 0 ? false : this.emit('debug', `prepare meraki sensor service`);
                    const sensorServiceName = this.prefixForSsidName ? `Sensor W.${ssidName}` : `Sensor ${ssidName}`;
                    const sensorService = accessory.addService(Service.ContactSensor, sensorServiceName, `Ssid Service Sensor ${ssidName}`);
                    sensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorService.setCharacteristic(Characteristic.ConfiguredName, sensorServiceName);
                    sensorService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = ssid.state ?? false;
                            return state;
                        });
                    this.sensorServices.push(sensorService);
                };
            };

            return accessory;
        } catch (error) {
            throw new Error(error);
        };
    };

    //start
    async start() {
        try {
            this.merakiMr = new MerakiMr({
                host: this.host,
                apiKey: this.apiKey,
                networkId: this.networkId,
                deviceData: this.deviceData,
                hideUnconfiguredSsid: this.hideUnconfiguredSsids,
                enableDebugMode: this.enableDebugMode
            });

            this.merakiMr.on('deviceInfo', (ssidsCount) => {
                //meraki info
                if (this.startPrepareAccessory) {
                    //connect to deice success
                    this.emit('success', `Connect Success.`)
                    if (!this.disableLogDeviceInfo) {
                        this.emit('devInfo', `---- ${this.deviceName} ----`);
                        this.emit('devInfo', `Manufacturer: Cisco/Meraki`);
                        this.emit('devInfo', `Network: ${this.networkName}`);
                        this.emit('devInfo', `Network Id: ${this.networkId}`);
                        this.emit('devInfo', `Organization Id: ${this.organizationId}`);
                        this.emit('devInfo', `Exposed SSIDs: ${ssidsCount}`);
                        this.emit('devInfo', `----------------------------------`)
                    };
                };
            }).on('deviceState', async (exposedSsids, ssidsCount) => {
                this.exposedSsids = exposedSsids;

                //update characteristics of exposed ssids
                for (let i = 0; i < ssidsCount; i++) {
                    const state = exposedSsids[i].state;
                    if (this.services) {
                        this.services[i].updateCharacteristic(Characteristic.On, state);
                    };

                    if (this.sensorServices && this.ssidsSensor) {
                        this.sensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1)
                    };
                }
            })
                .on('success', (success) => {
                    this.emit('success', success);
                })
                .on('info', (info) => {
                    this.emit('message', info);
                })
                .on('debug', (debug) => {
                    this.emit('debug', debug);
                })
                .on('warn', (warn) => {
                    this.emit('warn', warn);
                })
                .on('error', (error) => {
                    this.emit('error', error);
                })

            //connect
            const connect = await this.merakiMr.connect();
            if (!connect) {
                return false;
            };

            //prepare accessory
            if (this.startPrepareAccessory) {
                const accessory = await this.prepareAccessory();
                this.emit('publishAccessory', accessory);
                this.startPrepareAccessory = false;
            }

            return true;
        } catch (error) {
            throw new Error(`Start error: ${error.message || error}}.`);
        };
    };
};
export default MerakiDevice;
