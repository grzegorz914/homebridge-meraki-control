import MerakiDb from './merakidb.js';
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
        this.prefixForClientName = config.enablePrefixForClientName || false;
        this.clientsSensor = config.enableSonsorClients || false;
    };

    async startImpulseGenerator() {
        try {
            //start impulse generator 
            await this.merakiDb.impulseGenerator.start([{ name: 'checkDeviceInfo', sampling: this.refreshInterval }]);
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

            //device
            const debug2 = !this.enableDebugMode ? false : this.emit('debug', `repare meraki service`);
            const exposedClients = this.exposedClients;

            this.services = [];
            this.sensorServices = [];
            for (const client of exposedClients) {
                const clientName = client.name;
                const serviceName = this.prefixForClientName ? `C.${clientName}` : clientName;
                const clientPolicyService = accessory.addService(Service.Outlet, serviceName, `Client Service ${clientName}`);
                clientPolicyService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                clientPolicyService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                clientPolicyService.getCharacteristic(Characteristic.On)
                    .onGet(async () => {
                        const state = client.policyState ?? false;
                        const policy = state ? client.policyType : 'Blocked';
                        const logInfo = this.disableLogInfo ? false : this.emit('message', `Client: ${clientName}, Policy: ${policy}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            const policy = state ? client.policyType : 'Blocked';
                            const policyUrl = `${ApiUrls.DbClients.replace('networkId', this.networkId)}/${client.id}/policy`;
                            const policyData = {
                                'devicePolicy': policy
                            }
                            await this.merakiDb.send(policyUrl, policyData);
                            const logInfo = this.disableLogInfo ? false : this.emit('message', `Client: ${clientName}, Policy: ${policy}`);
                        } catch (error) {
                            this.emit('warn', `Client: ${clientName}, set Policy error: ${error}`);
                        }
                    });
                this.services.push(clientPolicyService);

                if (this.clientsSensor) {
                    const debug = !this.enableDebugMode && i > 0 ? false : this.emit('debug', `prepare meraki sensor service`);
                    const sensorServiceName = this.prefixForClientName ? `Sensor C.${clientName}` : `Sensor ${clientName}`;
                    const sensorService = accessory.addService(Service.ContactSensor, sensorServiceName, `Client Service Sensor ${clientName}`);
                    sensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorService.setCharacteristic(Characteristic.ConfiguredName, sensorServiceName);
                    sensorService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = client.policyState ?? false;
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
            this.merakiDb = new MerakiDb({
                host: this.host,
                apiKey: this.apiKey,
                networkId: this.networkId,
                deviceData: this.deviceData,
                enableDebugMode: this.enableDebugMode
            });

            this.merakiDb.on('deviceInfo', (clientsCount) => {
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
                        this.emit('devInfo', `Exposed Clients: ${clientsCount}`);
                        this.emit('devInfo', `----------------------------------`)
                    };
                };
            }).on('deviceState', (exposedClients, clientsCount) => {
                this.exposedClients = exposedClients;

                for (let i = 0; i < clientsCount; i++) {
                    const state = exposedClients[i].policyState;
                    if (this.services) {
                        this.services[i].updateCharacteristic(Characteristic.On, state);
                    }

                    if (this.sensorServices && this.clientsSensor) {
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
                });

            //connect
            const connect = await this.merakiDb.connect();
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
