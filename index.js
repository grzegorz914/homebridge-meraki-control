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
    this.config = config;
    this.api = api;
    this.devices = config.devices || [];
    this.accessories = [];

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching');
      for (let i = 0; i < this.devices.length; i++) {
        const device = this.devices[i];
        if (!device.name || !device.apiKey || !device.organizationId || !device.networkId) {
          this.log.warn('Device name, api key, organization Id or network Id missing');
        } else {
          new merakiDevice(this.log, device, this.api);
        }
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
    this.dashboardClientsPolicy = config.dashboardClientsPolicy || [];
    this.accessPointsControl = config.accessPointsControl || false;
    this.hideUnconfiguredSsids = config.hideUnconfiguredSsids || false;
    this.hideSsids = config.hideSsids || [];
    this.switchesControl = config.switchesControl || false;
    this.switches = config.switches || [];
    this.switchesHideUplinkPorts = config.switchesHideUplinkPorts || false;

    //setup variables
    this.checkDeviceInfo = true;
    this.startPrepareAccessory = true;

    //meraki dashboard
    this.dashboardClientsCount = 0;
    this.configuredClientsCount = this.dashboardClientsPolicy.length;
    this.exposedAndExistingOnDaschboardClientsCount = 0;

    //meraki mr
    this.ssidsCount = 0;
    this.configuredHiddenSsidsCount = this.accessPointsControl ? this.hideSsids.length : 0;
    this.exposedSsidsCount = 0;

    //meraki mrs
    this.switchesCount = this.switchesControl ? this.switches.length : 0;
    this.exposedSwitchesCount = 0;
    this.exposedSwitchPortsCount = 0;

    //meraki url
    const BASE_API_URL = `${this.host}/api/v1`;
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
    }

    this.updateDashboardClientsData();
  }

  async updateDashboardClientsData() {
    this.log.debug(`Network: ${this.name}, requesting dashboardClientsData.`);

    try {
      const dashboardClientsData = await this.axiosInstance.get(`${this.dashboardClientsUrl}?perPage=255&timespan=2592000`);
      const debug = this.enableDebugMode ? this.log(`Debug dashboardClientsData: ${JSON.stringify(dashboardClientsData.data, null, 2)}`) : false;

      if (dashboardClientsData.status == 200) {
        this.clientsId = new Array();
        this.clientsMac = new Array();
        this.clientsDescription = new Array();

        const dashboardClientsCount = dashboardClientsData.data.length;
        for (let i = 0; i < dashboardClientsCount; i++) {
          const clientId = dashboardClientsData.data[i].id;
          const clientMac = (dashboardClientsData.data[i].mac).split(':').join('');
          const clientDescription = dashboardClientsData.data[i].description;

          this.clientsId.push(clientId);
          this.clientsMac.push(clientMac);
          this.clientsDescription.push(clientDescription);
        }

        //configured clients
        this.exposedAndExistongOnDashboardClientsName = new Array();
        this.exposedAndExistingOnDashboardClientsId = new Array();
        this.exposedAndExistongOnDashboardClientsMac = new Array();
        this.exposedAndExistongOnDashboardClientsPolicy = new Array();

        for (let j = 0; j < this.configuredClientsCount; j++) {
          const configuredClientName = this.dashboardClientsPolicy[j].name;
          const configuredClientMac = (this.dashboardClientsPolicy[j].mac).split(':').join('');
          const configuredClientPolicyType = this.dashboardClientsPolicy[j].type;
          const configuredClientEnabled = (this.dashboardClientsPolicy[j].mode == true);

          const clientIndex = configuredClientEnabled ? this.clientsMac.indexOf(configuredClientMac) : -1;
          const configuredClientId = (clientIndex != -1 && clientIndex != undefined) ? this.clientsId[clientIndex] : -1;

          //check and push existed clients in dshboard
          const exposeClient = (configuredClientId != -1);
          const exposedAndExistongOnDashboardClientsName = exposeClient ? this.exposedAndExistongOnDashboardClientsName.push(configuredClientName) : false;
          const exposedAndExistongClientsOnDashboardId = exposeClient ? this.exposedAndExistingOnDashboardClientsId.push(configuredClientId) : false;
          const exposedAndExistongOnDashboardClientsMac = exposeClient ? this.exposedAndExistongOnDashboardClientsMac.push(configuredClientMac) : false;
          const exposedAndExistongOnDashboardClientsPolicy = exposeClient ? this.exposedAndExistongOnDashboardClientsPolicy.push(configuredClientPolicyType) : false;
        }

        const exposedAndExistingOnDaschboardClientsCount = this.exposedAndExistingOnDashboardClientsId.length;

        this.dashboardClientsCount = dashboardClientsCount;
        this.exposedAndExistingOnDaschboardClientsCount = exposedAndExistingOnDaschboardClientsCount;
        const updateDashboardClientsPolicy = (exposedAndExistingOnDaschboardClientsCount > 0) ? this.updateDashboardClientsPolicyData() : this.accessPointsControl ? this.updateWirelessData() : this.switchesControl ? this.updateSwitchData() : this.getDeviceInfo();
      }
    } catch (error) {
      this.log.error(`Network: ${this.name}, dashboardClientsData error: ${error}. reconnect in 10s.`);
      this.reconnect();
    };
  }

  async updateDashboardClientsPolicyData() {
    this.log.debug(`Network: ${this.name}, requesting dashboardClientsPolicyData.`);

    try {
      this.clientsPolicyMac = new Array();
      this.clientsPolicyPolicy = new Array();
      this.clientsPolicyState = new Array();

      const exposedAndExistingOnDaschboardClientsCount = this.exposedAndExistingOnDaschboardClientsCount;
      for (let i = 0; i < exposedAndExistingOnDaschboardClientsCount; i++) {
        const configuredClientId = this.exposedAndExistingOnDashboardClientsId[i];

        const dashboardClientPolicyData = await this.axiosInstance.get(`${this.dashboardClientsUrl}/${configuredClientId}/policy`);
        const debug = this.enableDebugMode ? this.log(`Debug dashboardClientPolicyData: ${JSON.stringify(dashboardClientPolicyData.data[0], null, 2)}`) : false;

        if (dashboardClientPolicyData.status == 200) {
          const clientPolicyMac = dashboardClientPolicyData.data.mac;
          const clientPolicyPolicy = (dashboardClientPolicyData.data.devicePolicy != undefined) ? (dashboardClientPolicyData.data.devicePolicy) : 'undefined';
          const clientPolicyState = (clientPolicyPolicy != 'Blocked');

          if (this.merakiDashboardClientPolicyServices && clientPolicyPolicy != undefined) {
            this.merakiDashboardClientPolicyServices[i]
              .updateCharacteristic(Characteristic.On, clientPolicyState);
          }

          this.clientsPolicyMac.push(clientPolicyMac);
          this.clientsPolicyPolicy.push(clientPolicyPolicy);
          this.clientsPolicyState.push(clientPolicyState);
        }
      }

      const updateSwitchOrWirelessOrGetDeviceInfo = this.accessPointsControl ? this.updateWirelessData() : this.switchesControl ? this.updateSwitchData() : this.getDeviceInfo();
    } catch (error) {
      this.log.error(`Network: ${this.name}, dashboardClientPolicyData error: ${error}. reconnect in 10s.`);
      this.reconnect();
    };
  }

  async updateWirelessData() {
    this.log.debug(`Network: ${this.name}, requesting ssidsData.`);

    try {
      const ssidsData = await this.axiosInstance.get(this.wirelessUrl);
      const debug = this.enableDebugMode ? this.log(`Debug ssidsData: ${JSON.stringify(ssidsData.data, null, 2)}`) : false;

      if (ssidsData.status == 200) {
        this.hiddenSsidsName = new Array();
        this.ssidsName = new Array();
        this.ssidsState = new Array();
        this.exposedSsidsName = new Array();
        this.exposedSsidsState = new Array();

        const configuredHiddenSsidsCount = this.configuredHiddenSsidsCount;
        const ssidsCount = ssidsData.data.length;

        for (let i = 0; i < configuredHiddenSsidsCount; i++) {
          const hiddenSsidName = this.hideSsids[i].name;
          const hiddenSsidEnabled = (this.hideSsids[i].mode == true);

          //push ssids
          const hiddenSsidsName = (hiddenSsidEnabled && hiddenSsidName != undefined) ? this.hiddenSsidsName.push(hiddenSsidName) : false;
        }

        for (let i = 0; i < ssidsCount; i++) {
          const ssidName = ssidsData.data[i].name;
          const ssidState = (ssidsData.data[i].enabled == true)
          this.ssidsName.push(ssidName);
          this.ssidsState.push(ssidState);

          //filter ssids
          const hideUnconfiguredSsids = this.hideUnconfiguredSsids ? (ssidName.substr(0, 12) == 'Unconfigured') : false;
          const hideSsid = hideUnconfiguredSsids ? true : (this.hiddenSsidsName.indexOf(ssidName) >= 0);

          //push exposed ssids
          const pushName = hideSsid ? false : this.exposedSsidsName.push(ssidName);
          const pushState = hideSsid ? false : this.exposedSsidsState.push(ssidState);
        }

        const exposedSsidsCount = this.exposedSsidsName.length;
        for (let i = 0; i < exposedSsidsCount; i++) {
          const ssidState = (this.exposedSsidsState[i] == true);

          if (this.merakiWirelessServices && (ssidState != undefined)) {
            this.merakiWirelessServices[i]
              .updateCharacteristic(Characteristic.On, ssidState);
          }
        }
        this.ssidsCount = ssidsCount;
        this.exposedSsidsCount = exposedSsidsCount;

        const updateSwitchOrGetDeviceInfo = this.switchesControl ? this.updateSwitchData() : this.getDeviceInfo();
      }
    } catch (error) {
      this.log.error(`Network: ${this.name}, ssidsData error: ${error}. reconnect in 10s.`);
      this.reconnect();
    };
  }

  async updateSwitchData() {
    this.log.debug(`Network: ${this.name}, requesting switchData.`);

    try {
      this.exposedSwitchesSerialNumber = new Array();

      //get switches config
      const configuredSwitchesCount = this.switchesCount;
      if (configuredSwitchesCount > 0) {

        const switchSerialNumber = this.switches[0].serialNumber;
        const switchControlEnabled = (this.switches[0].mode == true);
        const exposedSwitchSerialNumber = (switchControlEnabled && switchSerialNumber != undefined) ? this.exposedSwitchesSerialNumber.push(switchSerialNumber) : false;
      }

      this.switchPortsId = new Array();
      this.switchPortsName = new Array();
      this.switchPortsState = new Array();
      this.switchPortsPoeState = new Array();

      //get switch config
      const exposedSwitchesCount = this.exposedSwitchesSerialNumber.length;
      for (let i = 0; i < exposedSwitchesCount; i++) {
        const switchPortsUrl = `/devices/${this.exposedSwitchesSerialNumber[i]}/switch/ports`;
        const switchPortsData = await this.axiosInstance.get(switchPortsUrl);
        const debug = this.enableDebugMode ? this.log(`Debug switchPortsData: ${JSON.stringify(switchPortsData.data, null, 2)}`) : false;

        if (switchPortsData.status == 200) {
          const switchPortsCount = switchPortsData.data.length;
          for (let j = 0; j < switchPortsCount; j++) {
            const switchPortId = switchPortsData.data[j].portId;
            const switchPortName = switchPortsData.data[j].name;
            const switchPortState = (switchPortsData.data[j].enabled == true);
            const switchPortPoeState = (switchPortsData.data[j].poeEnabled == true);

            const switchesHideUplinkPorts = this.switchesHideUplinkPorts ? (switchPortName.substr(0, 6) == 'Uplink') : false;
            if (!switchesHideUplinkPorts) {
              this.switchPortsId.push(switchPortId);
              this.switchPortsName.push(switchPortName);
              this.switchPortsState.push(switchPortState);
              this.switchPortsPoeState.push(switchPortPoeState);
            };
          };
        };
      };

      const exposedPortsCount = this.switchPortsId.length;
      for (let k = 0; k < exposedPortsCount; k++) {
        const switchPortState = (this.switchPortsState[k] == true);

        if (this.merakiSwitchServices) {
          this.merakiSwitchServices[k]
            .updateCharacteristic(Characteristic.On, switchPortState);
        };
      }

      this.exposedSwitchesCount = exposedSwitchesCount;
      this.exposedPortsCount = exposedPortsCount;
      this.getDeviceInfo();
    } catch (error) {
      this.log.error(`Network: ${this.name}, switchPortsData error: ${error}. reconnect in 10s.`);
      this.reconnect();
    };
  };

  updateData() {
    setTimeout(() => {
      this.updateDashboardClientsData();
    }, this.refreshInterval * 1000);
  };

  reconnect() {
    setTimeout(() => {
      this.updateDashboardClientsData();
    }, 10000);
  };

  getDeviceInfo() {
    if (!this.disableLogDeviceInfo && this.checkDeviceInfo) {
      this.log(`-------- ${this.name} --------`);
      this.log(`Manufacturer: Cisco/Meraki`);
      this.log(`Network: ${this.name}`);
      this.log(`Network Id: ${this.networkId}`);
      this.log(`Organization Id: ${this.organizationId}`);
      this.log(`----------------------------------`);
      this.checkDeviceInfo = false;
    };

    this.updateData();
    const startPrepareAccessory = this.startPrepareAccessory ? this.prepareAccessory() : false;
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
    const exposedAndExistingOnDaschboardClientsCount = this.exposedAndExistingOnDaschboardClientsCount;
    const exposedSsidsCount = this.exposedSsidsCount;
    const exposedSwitchesCount = this.exposedSwitchesCount;
    const exposedSwitchPortsCount = this.exposedPortsCount;

    this.merakiDashboardClientPolicyServices = new Array();
    for (let i = 0; i < exposedAndExistingOnDaschboardClientsCount; i++) {
      const clientName = this.exposedAndExistongOnDashboardClientsName[i];
      const exposedClientName = `C. ${clientName}`;

      const merakiDashboardClientPolicyService = new Service.Outlet(exposedClientName, `merakiDashboardClientPolicyService${i}`);
      merakiDashboardClientPolicyService.getCharacteristic(Characteristic.On)
        .onGet(async () => {
          const state = (this.clientsPolicyState[i] != undefined) ? this.clientsPolicyState[i] : true;
          const policy = state ? this.clientsPolicyPolicy[i] : 'Blocked';
          const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Client: % ${clientName}, Policy: ${policy}`);
          return state;
        })
        .onSet(async (state) => {
          try {
            const clientId = this.exposedAndExistingOnDashboardClientsId[i];
            const policy = state ? this.exposedAndExistongOnDashboardClientsPolicy[i] : 'Blocked';
            const setClientPolicy = await this.axiosInstance.put(`${this.dashboardClientsUrl}/${clientId}/policy`, {
              'devicePolicy': policy
            });
            const debug = this.enableDebugMode ? this.log(`Network: ${accessoryName}, Client: ${clientName}, debug setClientPolicy: ${setClientPolicy.data}`) : false;
            const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Client: % ${clientName}, Policy: ${policy}`);
            this.updateDashboardClientsData();
          } catch (error) {
            this.log.error(`Network: ${accessoryName}, Client: ${clientName}, set Policy error: ${error}`);
          }
        });

      this.merakiDashboardClientPolicyServices.push(merakiDashboardClientPolicyService);
      accessory.addService(this.merakiDashboardClientPolicyServices[i]);
    }

    this.merakiWirelessServices = new Array();
    for (let i = 0; i < exposedSsidsCount; i++) {
      const ssidName = this.exposedSsidsName[i];
      const exposedSsidName = `W. ${ssidName}`;

      const merakiWirelessService = new Service.Outlet(exposedSsidName, `merakiWirelessService${i}`);
      merakiWirelessService.getCharacteristic(Characteristic.On)
        .onGet(async () => {
          const state = this.exposedSsidsState[i];
          const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, SSID: ${ssidName}, state: ${state ? 'Enabled' : 'Disabled'}`);
          return state;
        })
        .onSet(async (state) => {
          try {
            state = state ? true : false;
            const ssidIndex = this.ssidsName.indexOf(ssidName);
            const setSsid = await this.axiosInstance.put(`${this.wirelessUrl}/${ssidIndex}`, {
              'enabled': state
            });
            const debug = this.enableDebugMode ? this.log(`Network: ${accessoryNamee}, SSID: ${ssidName}, debug setSsid: ${setSsid.data}`) : false;
            const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryNamee}, SSID: ${ssidName}, set state: ${state ? 'Enabled' : 'Disabled'}`);
            this.updateWirelessData();
          } catch (error) {
            this.log.error(`Network: ${accessoryName}, SSID: ${ssidName}, set state error: ${error}`);
          }
        });

      this.merakiWirelessServices.push(merakiWirelessService);
      accessory.addService(merakiWirelessService);
    }

    //meraki ms
    if (exposedSwitchesCount > 0) {
      this.merakiSwitchServices = new Array();
      for (let i = 0; i < exposedSwitchPortsCount; i++) {
        const switchPortName = this.switchPortsName[i];
        const switchPortId = this.switchPortsId[i];
        const exposedSwitchPortName = `${switchPortId}. ${switchPortName}`;

        const merakiSwitchService = new Service.Outlet(exposedSwitchPortName, `merakiSwitchService${i}`);
        merakiSwitchService.getCharacteristic(Characteristic.On)
          .onGet(async () => {
            const state = this.switchPortsState[i] != undefined ? this.switchPortsState[i] : false;
            const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Port: ${switchPortId}, Name: ${switchPortName}, state: ${state ? 'Enabled' : 'Disabled'}`);
            return state;
          })
          .onSet(async (state) => {
            try {
              state = state ? true : false;
              const switchPortId = this.switchPortsId[i];
              const switchPortUrl = `/devices/${this.switches[0].serialNumber}/switch/ports/${switchPortId}`;
              const setSwitchPort = await this.axiosInstance.put(switchPortUrl, {
                'enabled': state
              });
              const debug = this.enableDebugMode ? this.log(`Network: ${accessoryName}, Port: ${switchPortId}, Name: ${switchPortName}, debug setSwitchPort: ${setSwitchPort.data}`) : false;
              const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Port: ${switchPortId}, Name: ${switchPortName}, set state: ${state ? 'Enabled' : 'Disabled'}`);
              this.updateSwitchData();
            } catch (error) {
              this.log.error(`Network: ${accessoryName}, Port: ${switchPortId}, Name: ${switchPortName}, set state error: %${error}`);
            }
          });

        this.merakiSwitchServices.push(merakiSwitchService);
        accessory.addService(this.merakiSwitchServices[i]);
      };
    };

    this.startPrepareAccessory = false;
    this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
    this.log.debug(`Network: ${accessoryName}, published as external accessory.`);
  };
};