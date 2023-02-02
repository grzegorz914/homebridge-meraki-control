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
    const devices = config.devices;

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching');
      for (const device of devices) {
        if (!device.name || !device.apiKey || !device.organizationId || !device.networkId) {
          this.log.warn('Device name, api key, organization Id or network Id missing');
          return
        }
        new merakiDevice(this.log, device, this.api);
      }
    });
  }

  configureAccessory(accessory) {
    this.log.debug('configurePlatformAccessory');
    this.accessories.push(accessory);
  }

  removeAccessory(accessory) {
    this.log.debug('removePlatformAccessory');
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }
}

class merakiDevice {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
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
    this.switchesControl = config.switchesControl || false;
    this.switches = config.switches || [];

    //setup variables
    this.checkDeviceInfo = true;
    this.startPrepareAccessory = true;
    this.confClientsCount = this.clientsPolicy.length;

    //meraki dashboard
    this.clientsPolicyMac = [];
    this.clientsPolicyPolicy = [];
    this.clientsPolicyState = [];
    this.dbExposedAndExistingClientsCount = 0;

    //meraki mr
    this.apSsidsStates = [];
    this.apExposedSsidsCount = 0;

    //meraki ms
    this.swPortsStates = [];
    this.switchesCount = 0;
    this.swExposedCount = 0;
    this.swExposedPortsCount = 0;

    //meraki url
    const BASE_API_URL = `${this.host}/api/v1`;
    this.organizationsIdUrl = `/organizations`;
    this.networksIdUrl = `/organizations/${this.organizationId}/networks`;
    this.networkUrl = `/networks/${this.networkId}`;
    this.devicesUrl = `/organizations/${this.organizationId}/devices`;
    this.dashboardClientsUrl = `/networks/${this.networkId}/clients`;
    this.aplianceUrl = `/networks/${this.networkId}/appliance/ports`;
    this.wirelessUrl = `/networks/${this.networkId}/wireless/ssids`;

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
      const startPrepareAccessory = this.startPrepareAccessory ? this.prepareAccessory() : false;

      //start update data
      const startDashboardClientsUpdate = this.updateDashboardClients();
      const startDashboardClientsPolicyUpdate = dbExposedAndExistingClientsCount > 0 ? this.updateDashboardClientsPolicy() : false;
      const startAccessPointsUpdate = this.accessPointsControl ? this.updateAccessPoints() : false;
      const startSwitchesUpdate = this.switchesControl ? this.updateSwitches() : false;
    } catch (error) {
      this.log.error(`Device: ${this.host} ${this.name}, ${error}, reconnect in 15s.`);
      this.reconnect();
    };
  };

  async updateDashboardClients() {
    await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
    this.updateDashboardClientsData();
  };

  async updateDashboardClientsPolicy() {
    await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
    this.updateDashboardClientsPolicyData();
  };

  async updateAccessPoints() {
    await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
    this.updateAccessPointsData();
  };

  async updateSwitches() {
    await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
    this.updateSwitchesData();
  };

  updateDashboardClientsData() {
    return new Promise(async (resolve, reject) => {
      this.log.debug(`Network: ${this.name}, requesting dashboard clients data.`);

      try {
        const dbClientsData = await this.axiosInstance.get(`${this.dashboardClientsUrl}?perPage=255&timespan=2592000`);
        const debug = this.enableDebugMode ? this.log(`Debug dashboard clients data: ${JSON.stringify(dbClientsData.data, null, 2)}`) : false;

        if (dbClientsData.status === 200) {
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
            const clientEnabled = (client.mode === true);

            const clientIndex = clientEnabled ? this.dbClientsMac.indexOf(clientMac) : -1;
            const clientId = (clientIndex !== -1 && clientIndex !== undefined) ? this.dbClientsId[clientIndex] : -1;

            //check and push existed clients in dshboard
            const exposeClient = (clientId !== -1);
            const pushExposedAndExistingClientName = exposeClient ? this.dbExposedAndExistingClientsName.push(clientName) : false;
            const pushExposedAndExistongClientId = exposeClient ? this.dbExposedAndExistingClientsId.push(clientId) : false;
            const pushExposedAndExistongClientMac = exposeClient ? this.dbExposedAndExistingClientsMac.push(clientMac) : false;
            const pushExposedAndExistongClientPolicy = exposeClient ? this.dbExposedAndExistingClientsPolicy.push(clientPolicyType) : false;
          };

          this.dbExposedAndExistingClientsCount = this.dbExposedAndExistingClientsId.length;

          if (!this.checkDeviceInfo) {
            this.updateDashboardClients();
            return;
          }
          resolve(this.dbExposedAndExistingClientsCount);
        }
      } catch (error) {
        reject(`Network: ${this.name}, dashboard clients data error: ${error}. reconnect in 15s.`);
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

          if (dbClientsPolicyData.status === 200) {
            const clientPolicyMac = dbClientsPolicyData.data.mac;
            const clientPolicyPolicy = dbClientsPolicyData.data.devicePolicy || 'undefined';
            const clientPolicyState = clientPolicyPolicy !== 'Blocked' || false;

            if (this.merakiDashboardClientPolicyServices && (clientPolicyState !== this.clientsPolicyState[i])) {
              this.merakiDashboardClientPolicyServices[i]
                .updateCharacteristic(Characteristic.On, clientPolicyState);
            }

            const pushReplace = this.checkDeviceInfo ? this.clientsPolicyMac.push(clientPolicyMac) : this.clientsPolicyMac[i] = clientPolicyMac;
            const pushReplace1 = this.checkDeviceInfo ? this.clientsPolicyPolicy.push(clientPolicyPolicy) : this.clientsPolicyPolicy[i] = clientPolicyPolicy;
            const pushReplace2 = this.checkDeviceInfo ? this.clientsPolicyState.push(clientPolicyState) : this.clientsPolicyState[i] = clientPolicyState;
          };
        };

        if (!this.checkDeviceInfo) {
          this.updateDashboardClientsPolicy();
          return;
        }
        resolve(true);
      } catch (error) {
        reject(`Network: ${this.name}, dashboard client policy data error: ${error}. reconnect in 15s.`);
      };
    });
  };

  updateAccessPointsData() {
    return new Promise(async (resolve, reject) => {
      this.log.debug(`Network: ${this.name}, requesting access points data.`);

      try {
        const apData = await this.axiosInstance.get(this.wirelessUrl);
        const debug = this.enableDebugMode ? this.log(`Debug access points data: ${JSON.stringify(apData.data, null, 2)}`) : false;

        if (apData.status === 200) {
          this.apHiddenSsidsName = [];
          this.apSsidsNumber = [];
          this.apSsidsName = [];
          this.apSsidsState = [];

          //hidde ssid by name
          for (const hideSsid of this.accessPointsHideSsidsByName) {
            const hideSsidName = hideSsid.name;
            const hideSsidEnabled = hideSsid.mode;
            const pushHideSsidsName = (hideSsidEnabled && hideSsidName !== undefined) ? this.apHiddenSsidsName.push(hideSsidName) : false;
          };

          for (const ssid of apData.data) {
            const ssidNumber = ssid.number;
            const ssidName = ssid.name;
            const ssidState = (ssid.enabled === true)

            //hidde unconfigured ssids
            const hideUnconfiguredSsids = (this.accessPointsHideUnconfiguredSsids && (ssidName.substr(0, 12) === 'Unconfigured')) ? true : false;

            //push exposed ssids
            const hidePort = (hideUnconfiguredSsids || this.apHiddenSsidsName.indexOf(ssidName) >= 0) ? true : false;
            const pushNumber = hidePort ? false : this.apSsidsNumber.push(ssidNumber);
            const pushName = hidePort ? false : this.apSsidsName.push(ssidName);
            const pushState = hidePort ? false : this.apSsidsState.push(ssidState);
          };

          const apExposedSsidsCount = this.apSsidsState.length;
          for (let i = 0; i < apExposedSsidsCount; i++) {
            const ssidState = this.apSsidsState[i] || false;

            if (this.apServices && (ssidState !== this.apSsidsStates[i])) {
              this.apServices[i]
                .updateCharacteristic(Characteristic.On, ssidState);
            };
            const pushReplace = this.checkDeviceInfo ? this.apSsidsStates.push(ssidState) : this.apSsidsStates[i] = ssidState;
          };

          this.apExposedSsidsCount = apExposedSsidsCount;

          if (!this.checkDeviceInfo) {
            this.updateAccessPoints();
            return;
          }
          resolve(true);
        }
      } catch (error) {
        reject(`Network: ${this.name}, access points data error: ${error}. reconnect in 15s.`);
      };
    });
  };

  updateSwitchesData() {
    return new Promise(async (resolve, reject) => {
      this.log.debug(`Network: ${this.name}, requesting switches data.`);

      try {
        //switches cinfigured
        this.swNames = [];
        this.swSerialsNumber = [];
        this.swHideUplinksPort = [];
        this.swHiddenPortsByName = [];

        //switches configured
        for (const sw of this.switches) {
          const name = sw.name;
          const serialNumber = sw.serialNumber;
          const hideUplinkPort = sw.hideUplinkPorts;
          const controlEnabled = sw.mode;
          const hidePortsByNameCount = sw.hidePorts.length || 0;
          const pushName = (controlEnabled && name !== undefined) ? this.swNames.push(name) : false;
          const pushSerialNumber = (controlEnabled && serialNumber !== undefined) ? this.swSerialsNumber.push(serialNumber) : false;
          const pushHiddenUplinkPort = (controlEnabled && serialNumber !== undefined) ? this.swHideUplinksPort.push(hideUplinkPort) : false;

          //hidde port by name
          for (const hidePort of sw.hidePorts) {
            const hidePortName = hidePort.name;
            const hidePortEnabled = (hidePort.mode === true);
            const pushHiddenPortName = (hidePortEnabled && hidePortName !== undefined) ? this.swHiddenPortsByName.push(hidePortName) : false;
          };
        };

        //switches ports state
        this.swPortsSn = [];
        this.swPortsId = [];
        this.swPortsName = [];
        this.swPortsState = [];
        this.swPortsPoeState = [];

        const swExposedCount = this.swSerialsNumber.length;
        for (let i = 0; i < swExposedCount; i++) {
          const serialNumber = this.swSerialsNumber[i];
          const portsUrl = `/devices/${serialNumber}/switch/ports`;
          const swData = await this.axiosInstance.get(portsUrl);
          const debug = this.enableDebugMode ? this.log(`Debug switches data: ${JSON.stringify(swData.data, null, 2)}`) : false;

          if (swData.status === 200) {
            for (const port of swData.data) {
              const portId = port.portId;
              const portName = port.name;
              const portState = (port.enabled === true);
              const portPoeState = (port.poeEnabled === true);
              const hideUplinksPorts = (this.swHideUplinksPort[i] === true && portName.substr(0, 6) === 'Uplink');

              //push exposed ports
              const swHidePort = (hideUplinksPorts || this.swHiddenPortsByName.indexOf(portName) >= 0) ? true : false;
              const pushSwitchSerialNumber = swHidePort ? false : this.swPortsSn.push(serialNumber);
              const pushSwitchPortId = swHidePort ? false : this.swPortsId.push(portId);
              const pushSwitchPortName = swHidePort ? false : this.swPortsName.push(portName);
              const pushSwitchPortState = swHidePort ? false : this.swPortsState.push(portState);
              const pushSwitchPortPoeState = swHidePort ? false : this.swPortsPoeState.push(portPoeState);
            };
          };
        };

        const swExposedPortsCount = this.swPortsSn.length;
        for (let i = 0; i < swExposedPortsCount; i++) {
          const portState = this.swPortsState[i] || false;

          if (this.swServices && (portState !== this.swPortsStates[i])) {
            this.swServices[i]
              .updateCharacteristic(Characteristic.On, portState);
          };
          const pushReplace = this.checkDeviceInfo ? this.swPortsStates.push(portState) : this.swPortsStates[i] = portState;
        };

        this.swExposedCount = swExposedCount;
        this.swExposedPortsCount = swExposedPortsCount;

        if (!this.checkDeviceInfo) {
          this.updateSwitches();
          return;
        }
        resolve(true);
      } catch (error) {
        reject(`Network: ${this.name}, switches data error: ${error}. reconnect in 15s.`);
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
        this.log(`----------------------------------`);

        this.checkDeviceInfo = false;
        resolve(true);
      };
    });
  };

  //Prepare accessory
  prepareAccessory() {
    this.log.debug('prepareAccessory');
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

    //get devices data variables
    const dbExposedAndExistingClientsCount = this.dasboardExposedAndExistingClientsCount;
    const apExposedSsidsCount = this.apExposedSsidsCount;
    const swExposedCount = this.swExposedCount;
    const swExposedPortsCount = this.swExposedPortsCount;

    if (dbExposedAndExistingClientsCount > 0) {
      this.merakiDashboardClientPolicyServices = [];
      //clients
      for (let i = 0; i < dbExposedAndExistingClientsCount; i++) {
        const dbClientName = this.dbExposedAndExistingClientsName[i];
        const dbServiceName = `C. ${dbClientName}`;

        const dbClientPolicyService = new Service.Outlet(dbServiceName, `dbClientPolicyService${i}`);
        dbClientPolicyService.getCharacteristic(Characteristic.On)
          .onGet(async () => {
            const state = this.clientsPolicyState[i] || true;
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
              const debug = this.enableDebugMode ? this.log(`Network: ${accessoryName}, Client: ${dbClientName}, debug set client Policy: ${setClientPolicy.data}`) : false;
              const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Client: % ${dbClientName}, Policy: ${policy}`);
              this.updateDashboardClientsData();
            } catch (error) {
              this.log.error(`Network: ${accessoryName}, Client: ${dbClientName}, set Policy error: ${error}`);
            }
          });

        this.merakiDashboardClientPolicyServices.push(dbClientPolicyService);
        accessory.addService(this.merakiDashboardClientPolicyServices[i]);
      };
    };

    //meraki mr
    if (apExposedSsidsCount > 0) {
      this.apServices = [];
      //ssids
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
              const debug = this.enableDebugMode ? this.log(`Network: ${accessoryName}, SSID: ${ssidName}, debug ap set Ssid: ${apSetSsid.data}`) : false;
              const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, SSID: ${ssidName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
              this.updateAccessPointsData();
            } catch (error) {
              this.log.error(`Network: ${accessoryName}, SSID: ${ssidName}, set state error: ${error}`);
            }
          });

        this.apServices.push(apService);
        accessory.addService(this.apServices[i]);
      };
    };

    //meraki ms
    if (swExposedPortsCount > 0) {
      this.swServices = [];
      //ports
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
              const debug = this.enableDebugMode ? this.log(`Network: ${accessoryName}, Port: ${this.swPortsId[i]}, Name: ${swPortName}, debug set switch Port: ${setSwitchPort.data}`) : false;
              const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Port: ${this.swPortsId[i]}, Name: ${swPortName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
              this.updateSwitchesData();
            } catch (error) {
              this.log.error(`Network: ${accessoryName}, Port: ${this.swPortsId[i]}, Name: ${swPortName}, set state error: %${error}`);
            }
          });

        this.swServices.push(swService);
        accessory.addService(this.swServices[i]);
      };
    };

    this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
    this.log.debug(`Network: ${accessoryName}, published as external accessory.`);
    this.startPrepareAccessory = false;
  };
};