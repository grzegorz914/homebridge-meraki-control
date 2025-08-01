import MerakiMs from './merakims.js';
import EventEmitter from 'events';
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
        this.prefixForPortName = deviceData.enablePrefixForPortName || false;
        this.portsSensor = deviceData.enableSensorPorts || false;
        this.poePortsControl = deviceData.enablePoePortsControl || false;

        //hidde port by name
        this.swHidenPortsByName = [];
        const hidePorts = deviceData.hidePorts || [];
        for (const port of hidePorts) {
            const hidePortName = port.name ?? false;
            const hidePortEnabled = port.mode || false;
            const pushHiddenPortName = hidePortName && hidePortEnabled ? this.swHidenPortsByName.push(hidePortName) : false;
        };
    };

    async startImpulseGenerator() {
        try {
            //start impulse generator 
            await this.merakiMs.impulseGenerator.start([{ name: 'checkDeviceInfo', sampling: this.refreshInterval }]);
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
            const accessoryCategory = Categories.SWITCH;
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
            const exposedPorts = this.exposedPorts;

            //device
            this.services = [];
            this.sensorServices = [];
            for (const port of exposedPorts) {
                const portName = port.name;
                const portId = port.id;
                const serviceName = this.prefixForPortName ? `${portId}.${portName}` : portName;
                const service = accessory.addService(Service.Outlet, serviceName, `service${portId}`);
                service.addOptionalCharacteristic(Characteristic.ConfiguredName);
                service.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                service.getCharacteristic(Characteristic.On)
                    .onGet(async () => {
                        const state = port.state ?? false;
                        const logInfo = this.disableLogInfo ? false : this.emit('message', `Port: ${portId}, Name: ${portName}, State: ${state ? 'Enabled' : 'Disabled'}`);
                        return state;
                    })
                    .onSet(async (state) => {
                        try {
                            state = state ? true : false;
                            const switchPortUrl = `/devices/${this.deviceUuid}/switch/ports/${portId}`;
                            const switchPortData = this.poePortControl ? {
                                'enabled': state,
                                'poeEnabled': state
                            } : {
                                'enabled': state
                            };
                            await this.merakiMs.send(switchPortUrl, switchPortData);
                            const logInfo = this.disableLogInfo ? false : this.emit('message', `Port: ${portId}, Name: ${portName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                        } catch (error) {
                            this.emit('warn', `Port: ${portId}, Name: ${portName}, set state error: %${error}`);
                        }
                    });
                this.services.push(service);

                if (this.portsSensor) {
                    const debug = !this.enableDebugMode && k > 0 ? false : this.emit('debug', `prepare meraki sensor service`);
                    const serviceName = this.prefixForPortName ? `Sensor ${portId}.${portName}` : `Sensor ${portName}`;
                    const sensorService = accessory.addService(Service.ContactSensor, serviceName, `sensorService${portId}`);
                    sensorService.addOptionalCharacteristic(Characteristic.ConfiguredName);
                    sensorService.setCharacteristic(Characteristic.ConfiguredName, serviceName);
                    sensorService.getCharacteristic(Characteristic.ContactSensorState)
                        .onGet(async () => {
                            const state = port.state;
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
            this.merakiMs = new MerakiMs({
                host: this.host,
                apiKey: this.apiKey,
                deviceData: this.deviceData,
                enableDebugMode: this.enableDebugMode
            })
                .on('deviceInfo', (portsCount) => {
                    //meraki info
                    if (this.startPrepareAccessory) {
                        //connect to deice success
                        this.emit('success', `Connect Success.`)
                        if (!this.disableLogDeviceInfo) {
                            this.emit('devInfo', `---- ${this.deviceName}: ${this.deviceUuid} ----`);
                            this.emit('devInfo', `Manufacturer: Cisco/Meraki`);
                            this.emit('devInfo', `Network: ${this.networkName}`);
                            this.emit('devInfo', `Network Id: ${this.networkId}`);
                            this.emit('devInfo', `Organization Id: ${this.organizationId}`);
                            this.emit('devInfo', `Ports: ${portsCount}`);
                            this.emit('devInfo', `----------------------------------`)
                        };
                    };
                })
                .on('deviceState', (ports) => {
                    const arr = [];
                    for (const port of ports) {

                        //hidde uplink and port by name
                        const portName = port.name ?? `Port ${port.portId}`;
                        const uplinkPort = portName.startsWith('Uplink');
                        const hideUplinkPort = this.deviceData.hideUplinkPorts && uplinkPort;
                        const hidePortByName = this.swHidenPortsByName.includes(portName);

                        //skip iterate
                        if (hideUplinkPort || hidePortByName) {
                            continue;
                        }
                        arr.push(port);
                    };
                    this.exposedPorts = arr;

                    //update characteristics of exposed ports
                    for (let i = 0; i < arr.length; i++) {
                        const name = arr[i].name;
                        const portId = arr[i].id;
                        const state = arr[i].state;
                        if (this.services) {
                            const serviceName = this.prefixForPortName ? `${portId}.${name}` : name;
                            this.services[i].updateCharacteristic(Characteristic.ConfiguredName, serviceName);
                            this.services[i].updateCharacteristic(Characteristic.On, state);
                        };

                        if (this.sensorServices && this.portsSensor) {
                            const serviceName = this.prefixForPortName ? `Sensor ${portId}.${name}` : `Sensor ${name}`;
                            this.sensorServices[i].updateCharacteristic(Characteristic.ConfiguredName, serviceName);
                            this.sensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1)
                        };
                    };
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
            const connect = await this.merakiMs.connect();
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
