'use strict';
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const PLUGIN_NAME = 'homebridge-meraki-control';
const PLATFORM_NAME = 'Meraki';
let Accessory, Characteristic, Service, Categories, UUID;

module.exports = (api) => {
  Accessory = api.platformAccessory;
  Characteristic = api.hap.Characteristic;
  Service = api.hap.Service;
  Categories = api.hap.Categories;
  UUID = api.hap.uuid;
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, merakiPlatform, true);
}

class merakiPlatform {
  constructor(log, config, api) {
    // only load if configured
    if (!config || !Array.isArray(config.devices)) {
      log(`No configuration found for ${PLUGIN_NAME}`);
      return;
    }
    this.log = log;
    this.api = api;
    this.accessories = [];

    api.on('didFinishLaunching', () => {
      log.debug('didFinishLaunching');
      for (const device of config.devices) {
        if (!device.name || !device.apiKey || !device.organizationId || !device.networkId) {
          log.warn('Device name, api key, organization Id or network Id missing');
          return
        }
        new merakiDevice(log, device, api);
      }
    });
  }

  configureAccessory(accessory) {
    this.log.debug('configurePlatformAccessory');
    this.accessories.push(accessory);
  }
}

class merakiDevice {
  constructor(log, config, api) {
    this.log = log;
    this.api = api;

    //network configuration
    this.host = config.host;
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.organizationId = config.organizationId;
    this.networkId = config.networkId;
    this.refreshInterval = config.refreshInterval || 5;
    this.disableLogInfo = config.disableLogInfo || false;
    this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;
    this.enableDebugMode = config.enableDebugMode || false;
    this.clientsPolicy = config.dashboardClientsPolicy || [];
    this.accessPointsControl = config.accessPointsControl || false;
    this.accessPointsHideUnconfiguredSsids = config.hideUnconfiguredSsids || false;
    this.accessPointsHideSsidsByName = config.hideSsids || [];
    this.accessPointsEnableSensorSsids = config.enableSonsorSsids || false;
    this.switchesControl = config.switchesControl || false;
    this.switches = config.switches || [];

    //meraki url
    const BASE_API_URL = `${this.host}/api/v1`;
    this.organizationsIdUrl = `/organizations`;
    this.networksIdUrl = `/organizations/${this.organizationId}/networks`;
    this.networkUrl = `/networks/${this.networkId}`;
    this.devicesUrl = `/organizations/${this.organizationId}/devices`;
    this.dashboardClientsUrl = `/networks/${this.networkId}/clients`;
    this.aplianceUrl = `/networks/${this.networkId}/appliance/ports`;
    this.wirelessUrl = `/networks/${this.networkId}/wireless/ssids`;

    //setup variables
    this.checkDeviceInfo = true;
    this.startPrepareAccessory = true;
    this.confClientsCount = this.clientsPolicy.length;

    //meraki dashboard
    this.clientsPolicyMac = [];
    this.clientsPolicyPolicy = [];
    this.clientsPolicyState = [];
    this.dbExposedAndExistingClientsCount = 0;

    //meraki access points hidde ssid by name
    this.apHiddenSsidsName = [];
    for (const hideSsid of this.accessPointsHideSsidsByName) {
      const hideSsidName = hideSsid.name || 'Undefined';
      const hideSsidEnabled = hideSsid.mode || false;
      const pushHideSsidsName = (hideSsidEnabled && hideSsidName !== 'Undefined') ? this.apHiddenSsidsName.push(hideSsidName) : false;
    };

    //meraki switches
    this.swNames = [];
    this.swSerialsNumber = [];
    this.swHideUplinksPort = [];
    this.swHiddenPortsByName = [];
    this.swPortsSensorEnabled = [];

    for (const sw of this.switches) {
      const name = sw.name || 'Undefined';
      const serialNumber = sw.serialNumber || false;
      const controlEnabled = sw.mode || false;
      const hideUplinkPort = sw.hideUplinkPorts || false;
      const enableSonsorPorts = sw.enableSonsorPorts || false;

      if (serialNumber && controlEnabled) {
        this.swNames.push(name);
        this.swSerialsNumber.push(serialNumber);
        this.swHideUplinksPort.push(hideUplinkPort);
        this.swPortsSensorEnabled.push(enableSonsorPorts);

        //hidde port by name
        for (const hidePort of sw.hidePorts) {
          const hidePortName = hidePort.name;
          const hidePortEnabled = hidePort.mode || false;
          const pushHiddenPortName = hidePortName && hidePortEnabled ? this.swHiddenPortsByName.push(hidePortName) : false;
        };
      };
    };

    this.axiosInstance = axios.create({
      baseURL: BASE_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Cisco-Meraki-API-Key': this.apiKey
      }
    });

    //preferences directory
    const prefDir = path.join(api.user.storagePath(), 'meraki');

    //check if prefs directory exist
    if (!fs.existsSync(prefDir)) {
      fs.mkdirSync(prefDir);
    };

    this.start();
  };

  async reconnect() {
    await new Promise(resolve => setTimeout(resolve, 15000));
    this.start();
  };

  async start() {
    this.log.debug(`Device: ${this.host} ${this.name}, start.`);
    this.checkDeviceInfo = true;

    try {
      const dbExposedAndExistingClientsCount = await this.updateDashboardClientsData();
      const updateDashboardClientsPolicyData = dbExposedAndExistingClientsCount > 0 ? await this.updateDashboardClientsPolicyData() : false;
      const updateAccessPointsData = this.accessPointsControl ? await this.updateAccessPointsData() : false;
      const updateSwitchesData = this.switchesControl ? await this.updateSwitchesData() : false;
      const getDeviceInfo = await this.getDeviceInfo();

      //prepare accessory
      const startPrepareAccessory = this.startPrepareAccessory ? await this.prepareAccessory() : false;

      //start update data
      const startDashboardClientsUpdate = this.updateDashboardClients();
      const startAccessPointsUpdate = this.accessPointsControl ? this.updateAccessPoints() : false;
      const startSwitchesUpdate = this.switchesControl ? this.updateSwitches() : false;
    } catch (error) {
      this.log.error(`Network: ${this.name}, ${error}, reconnect in ${this.refreshInterval} sec`);
      this.reconnect();
    };
  };

  async updateDashboardClients() {
    try {
      await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
      const dbExposedAndExistingClientsCount = await this.updateDashboardClientsData();
      const updateDashboardClientsPolicyData = dbExposedAndExistingClientsCount > 0 ? await this.updateDashboardClientsPolicyData() : false;
    } catch (error) {
      this.log.error(`Network: ${this.name}, ${error}, trying in ${this.refreshInterval} sec.`);
      this.updateDashboardClients();
    };
  };

  async updateAccessPoints() {
    try {
      await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
      await this.updateAccessPointsData();
    } catch (error) {
      this.log.error(`Network: ${this.name}, ${error}, trying in ${this.refreshInterval} sec.`);
      this.updateAccessPoints();
    };
  };

  async updateSwitches() {
    try {
      await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
      await this.updateSwitchesData();
    } catch (error) {
      this.log.error(`Network: ${this.name}, ${error}, trying in ${this.refreshInterval} sec.`);
      this.updateSwitches();
    };
  };

  updateDashboardClientsData() {
    return new Promise(async (resolve, reject) => {
      this.log.debug(`Network: ${this.name}, requesting dashboard clients data.`);

      try {
        const dbClientsData = await this.axiosInstance.get(`${this.dashboardClientsUrl}?perPage=255&timespan=2592000`);
        const debug = this.enableDebugMode ? this.log(`Debug dashboard clients data: ${JSON.stringify(dbClientsData.data, null, 2)}`) : false;

        this.dbClientsId = [];
        this.dbClientsMac = [];
        this.dbClientsDescription = [];

        for (const client of dbClientsData.data) {
          const clientId = client.id;
          const clientMac = (client.mac).split(':').join('');
          const clientDescription = client.description;

          this.dbClientsId.push(clientId);
          this.dbClientsMac.push(clientMac);
          this.dbClientsDescription.push(clientDescription);
        }

        //configured clients
        this.dbExposedAndExistingClientsName = [];
        this.dbExposedAndExistingClientsId = [];
        this.dbExposedAndExistingClientsMac = [];
        this.dbExposedAndExistingClientsPolicy = [];

        for (let j = 0; j < this.confClientsCount; j++) {
          const client = this.clientsPolicy[j];
          const clientName = client.name;
          const clientMac = (client.mac).split(':').join('');
          const clientPolicyType = client.type;
          const clientEnabled = client.mode;

          const clientIndex = clientEnabled ? this.dbClientsMac.indexOf(clientMac) : -1;
          const clientId = clientIndex !== -1 ? this.dbClientsId[clientIndex] : -1;

          //check and push existed clients in dshboard
          const exposeClient = (clientId !== -1);
          const pushExposedAndExistingClientName = exposeClient ? this.dbExposedAndExistingClientsName.push(clientName) : false;
          const pushExposedAndExistongClientId = exposeClient ? this.dbExposedAndExistingClientsId.push(clientId) : false;
          const pushExposedAndExistongClientMac = exposeClient ? this.dbExposedAndExistingClientsMac.push(clientMac) : false;
          const pushExposedAndExistongClientPolicy = exposeClient ? this.dbExposedAndExistingClientsPolicy.push(clientPolicyType) : false;
        };
        this.dbExposedAndExistingClientsCount = this.dbExposedAndExistingClientsId.length;

        resolve(this.dbExposedAndExistingClientsCount);
        const update = this.checkDeviceInfo ? false : this.updateDashboardClients();
      } catch (error) {
        reject(`dashboard clients data error: ${error}.`);
      };
    });
  };

  updateDashboardClientsPolicyData() {
    return new Promise(async (resolve, reject) => {
      this.log.debug(`Network: ${this.name}, requesting dashboard clients policy data.`);

      try {
        const dbExposedAndExistingClientsCount = this.dbExposedAndExistingClientsCount;
        for (let i = 0; i < dbExposedAndExistingClientsCount; i++) {
          const clientId = this.dbExposedAndExistingClientsId[i];

          const dbClientsPolicyData = await this.axiosInstance.get(`${this.dashboardClientsUrl}/${clientId}/policy`);
          const debug = this.enableDebugMode ? this.log(`Debug dashboard client policy data: ${JSON.stringify(dbClientsPolicyData.data[0], null, 2)}`) : false;

          if (dbClientsPolicyData.status !== 200) {
            reject(`Update dashboard client policy data status: ${dbClientsPolicyData.status}`);
            return;
          }

          const clientPolicyMac = dbClientsPolicyData.data.mac;
          const clientPolicyPolicy = dbClientsPolicyData.data.devicePolicy ?? 'undefined';
          const clientPolicyState = clientPolicyPolicy !== 'Blocked' ?? false;

          if (this.merakiDashboardClientPolicyServices && (clientPolicyState !== this.clientsPolicyState[i])) {
            this.merakiDashboardClientPolicyServices[i].updateCharacteristic(Characteristic.On, clientPolicyState);
          }

          const pushReplace = this.checkDeviceInfo ? this.clientsPolicyMac.push(clientPolicyMac) : this.clientsPolicyMac[i] = clientPolicyMac;
          const pushReplace1 = this.checkDeviceInfo ? this.clientsPolicyPolicy.push(clientPolicyPolicy) : this.clientsPolicyPolicy[i] = clientPolicyPolicy;
          const pushReplace2 = this.checkDeviceInfo ? this.clientsPolicyState.push(clientPolicyState) : this.clientsPolicyState[i] = clientPolicyState;
        };


        resolve();
      } catch (error) {
        reject(`dashboard client policy data error: ${error}.`);
      };
    });
  };

  updateAccessPointsData() {
    return new Promise(async (resolve, reject) => {
      this.log.debug(`Network: ${this.name}, requesting access points data.`);

      try {
        //ap ssids states
        this.apSsidsNumber = [];
        this.apSsidsName = [];
        this.apSsidsState = [];

        const apData = await this.axiosInstance.get(this.wirelessUrl);
        const debug = this.enableDebugMode ? this.log(`Debug access points data: ${JSON.stringify(apData.data, null, 2)}`) : false;

        for (const ssid of apData.data) {
          const ssidNumber = ssid.number;
          const ssidName = ssid.name;
          const ssidState = ssid.enabled;

          //hidde unconfigured and ssids by name
          const hideSsidsByName = this.apHiddenSsidsName.includes(ssidName);
          const hideUnconfiguredSsids = this.accessPointsHideUnconfiguredSsids && (ssidName.substr(0, 12) === 'Unconfigured');

          //push exposed ssids to array
          if (!hideUnconfiguredSsids && !hideSsidsByName) {
            this.apSsidsNumber.push(ssidNumber);
            this.apSsidsName.push(ssidName);
            this.apSsidsState.push(ssidState);
          };
        };

        //update characteristics of exposed ssids
        const ssidsCount = this.apSsidsState.length;
        for (let i = 0; i < ssidsCount; i++) {
          const state = this.apSsidsState[i];
          if (this.apServices && state != undefined) {
            this.apServices[i].updateCharacteristic(Characteristic.On, state);
          };

          if (this.apSensorServices && this.accessPointsEnableSensorSsids && state != undefined) {
            this.apSensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1)
          };
        }

        resolve();
        const update = this.checkDeviceInfo ? false : this.updateAccessPoints();
      } catch (error) {
        reject(`access points data error: ${error}.`);
      };
    });
  };

  updateSwitchesData() {
    return new Promise(async (resolve, reject) => {
      this.log.debug(`Network: ${this.name}, requesting switches data.`);

      try {
        //ports state
        this.swPortsSn = [];
        this.swPortsId = [];
        this.swPortsName = [];
        this.swPortsState = [];
        this.swPortsPoeState = [];
        this.swPortsSensorsEnable = [];

        const swCount = this.swSerialsNumber.length;
        for (let i = 0; i < swCount; i++) {
          const serialNumber = this.swSerialsNumber[i];
          const portsUrl = `/devices/${serialNumber}/switch/ports`;
          const swData = await this.axiosInstance.get(portsUrl);
          const debug = this.enableDebugMode ? this.log(`Debug switches data: ${JSON.stringify(swData.data, null, 2)}`) : false;
          const hideUplinks = this.swHideUplinksPort[i];
          const eableSonsorPorts = this.swPortsSensorEnabled[i];

          for (const port of swData.data) {
            const portId = port.portId;
            const portName = port.name;
            const portState = port.enabled;
            const portPoeState = port.poeEnabled;
            const hideUplinksPorts = hideUplinks && portName.substr(0, 6) === 'Uplink';
            const hidePortByName = this.swHiddenPortsByName.includes(portName);

            //push exposed ports to array
            if (!hideUplinksPorts && !hidePortByName) {
              this.swPortsSn.push(serialNumber);
              this.swPortsId.push(portId);
              this.swPortsName.push(portName);
              this.swPortsState.push(portState);
              this.swPortsPoeState.push(portPoeState);
              this.swPortsSensorsEnable.push(eableSonsorPorts);
            }
          };
        };

        //update characteristics of exposed ports
        const portsCount = this.swPortsState.length;
        for (let i = 0; i < portsCount; i++) {
          const state = this.swPortsState[i];
          if (this.swServices && state != undefined) {
            this.swServices[i].updateCharacteristic(Characteristic.On, state);
          };

          if (this.swSensorServices && this.swPortsSensorsEnable[i] && state != undefined) {
            this.swSensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1)
          };
        };

        resolve();
        const update = this.checkDeviceInfo ? false : this.updateSwitches();
      } catch (error) {
        reject(`switch data error: ${error}.`);
      };
    });
  };

  getDeviceInfo() {
    return new Promise((resolve, reject) => {
      if (!this.disableLogDeviceInfo && this.checkDeviceInfo) {
        this.log(`-------- ${this.name} --------`);
        this.log(`Manufacturer: Cisco/Meraki`);
        this.log(`Network: ${this.name}`);
        this.log(`Network Id: ${this.networkId}`);
        this.log(`Organization Id: ${this.organizationId}`);
        this.log(`----------------------------------`)
        this.checkDeviceInfo = false;
        resolve();
      };
    });
  };

  //Prepare accessory
  prepareAccessory() {
    return new Promise((resolve, reject) => {
      this.log.debug('prepareAccessory');
      try {
        const accessoryName = this.name;
        const accessoryUUID = UUID.generate(this.networkId);
        const accessoryCategory = Categories.AIRPORT;
        const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

        //Prepare information service
        this.log.debug('prepareInformationService');
        const manufacturer = 'Cisco/Meraki';
        const modelName = accessoryName;
        const serialNumber = this.networkId;
        const firmwareRevision = this.organizationId;

        accessory.getService(Service.AccessoryInformation)
          .setCharacteristic(Characteristic.Manufacturer, manufacturer)
          .setCharacteristic(Characteristic.Model, modelName)
          .setCharacteristic(Characteristic.SerialNumber, serialNumber)
          .setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);

        //Prepare service 
        this.log.debug('prepareMerakiService');
        const dbExposedAndExistingClientsCount = this.dasboardExposedAndExistingClientsCount;
        const apExposedSsidsCount = this.apSsidsState.length;
        const swCount = this.switches.length;
        const swExposedPortsCount = this.swPortsState.length;

        //meraki mx
        this.merakiDashboardClientPolicyServices = [];
        for (let i = 0; i < dbExposedAndExistingClientsCount; i++) {
          const dbClientName = this.dbExposedAndExistingClientsName[i];
          const dbServiceName = `C. ${dbClientName}`;

          const dbClientPolicyService = new Service.Outlet(dbServiceName, `dbClientPolicyService${i}`);
          dbClientPolicyService.getCharacteristic(Characteristic.On)
            .onGet(async () => {
              const state = this.clientsPolicyState[i];
              const policy = state ? this.clientsPolicyPolicy[i] : 'Blocked';
              const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Client: % ${dbClientName}, Policy: ${policy}`);
              return state;
            })
            .onSet(async (state) => {
              try {
                const policy = state ? this.dbExposedAndExistingClientsPolicy[i] : 'Blocked';
                const setClientPolicy = await this.axiosInstance.put(`${this.dashboardClientsUrl}/${this.dbExposedAndExistingClientsId[i]}/policy`, {
                  'devicePolicy': policy
                });
                const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Client: % ${dbClientName}, Policy: ${policy}`);
                this.updateDashboardClients();
              } catch (error) {
                this.log.error(`Network: ${accessoryName}, Client: ${dbClientName}, set Policy error: ${error}`);
              }
            });

          this.merakiDashboardClientPolicyServices.push(dbClientPolicyService);
          accessory.addService(this.merakiDashboardClientPolicyServices[i]);
        };

        //meraki mr
        this.apServices = [];
        this.apSensorServices = [];
        for (let i = 0; i < apExposedSsidsCount; i++) {
          const ssidName = this.apSsidsName[i];
          const apServiceName = `W. ${ssidName}`;

          const apService = new Service.Outlet(apServiceName, `apService${i}`);
          apService.getCharacteristic(Characteristic.On)
            .onGet(async () => {
              const state = this.apSsidsState[i];
              const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, SSID: ${ssidName}, state: ${state ? 'Enabled' : 'Disabled'}`);
              return state;
            })
            .onSet(async (state) => {
              try {
                state = state ? true : false;
                const apSetSsid = await this.axiosInstance.put(`${this.wirelessUrl}/${this.apSsidsNumber[i]}`, {
                  'enabled': state
                });
                const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, SSID: ${ssidName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                this.updateAccessPoints();
              } catch (error) {
                this.log.error(`Network: ${accessoryName}, SSID: ${ssidName}, set state error: ${error}`);
              }
            });

          this.apServices.push(apService);
          accessory.addService(this.apServices[i]);

          if (this.accessPointsEnableSensorSsids) {
            const apSensorServiceName = `W. Sensor ${ssidName}`;
            const apSensorService = new Service.ContactSensor(apSensorServiceName, `Ssid Sensor${i}`);
            apSensorService.getCharacteristic(Characteristic.ContactSensorState)
              .onGet(async () => {
                const state = this.apSsidsState[i];
                return state;
              });
            this.apSensorServices.push(apSensorService);
            accessory.addService(this.apSensorServices[i]);
          };
        };

        //meraki ms
        this.swServices = [];
        this.swSensorServices = [];
        for (let i = 0; i < swExposedPortsCount; i++) {
          const swPortName = this.swPortsName[i];
          const swServiceName = `${this.swPortsId[i]}. ${swPortName}`;

          const swService = new Service.Outlet(swServiceName, `swService${i}`);
          swService.getCharacteristic(Characteristic.On)
            .onGet(async () => {
              const state = this.swPortsState[i];
              const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Port: ${this.swPortsId[i]}, Name: ${swPortName}, state: ${state ? 'Enabled' : 'Disabled'}`);
              return state;
            })
            .onSet(async (state) => {
              try {
                state = state ? true : false;
                const switchPortUrl = `/devices/${this.swPortsSn[i]}/switch/ports/${this.swPortsId[i]}`;
                const setSwitchPort = await this.axiosInstance.put(switchPortUrl, {
                  'enabled': state
                });
                const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Port: ${this.swPortsId[i]}, Name: ${swPortName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                this.updateSwitches();
              } catch (error) {
                this.log.error(`Network: ${accessoryName}, Port: ${this.swPortsId[i]}, Name: ${swPortName}, set state error: %${error}`);
              }
            });

          this.swServices.push(swService);
          accessory.addService(this.swServices[i]);

          if (this.swPortsSensorsEnable[i]) {
            const swSensorServiceName = `${this.swPortsId[i]}. Sensor ${swPortName}`;
            const swSensorService = new Service.ContactSensor(swSensorServiceName, `Port Sensor${i}`);
            swSensorService.getCharacteristic(Characteristic.ContactSensorState)
              .onGet(async () => {
                const state = this.swPortsState[i];
                return state;
              });
            this.swSensorServices.push(swSensorService);
            accessory.addService(this.swSensorServices[i]);
          };
        };

        this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
        this.log.debug(`Network: ${accessoryName}, published as external accessory.`);
        this.startPrepareAccessory = false;
        resolve();
      } catch (error) {
        reject(`prepare accessory error: ${error}.`);
      };
    });
  };
};