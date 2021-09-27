'use strict';

const path = require('path');
const axios = require('axios');
const fs = require('fs');
const fsPromises = fs.promises;

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
      log('No configuration found for %s', PLUGIN_NAME);
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
        if (!device.name) {
          this.log.warn('Device Name Missing');
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
    this.disableLogInfo = config.disableLogInfo;
    this.dashboardClientsPolicy = config.dashboardClientsPolicy || [];
    this.accessPointsControl = config.accessPointsControl;
    this.hideUnconfiguredSsids = config.hideUnconfiguredSsids;
    this.hideSsids = config.hideSsids || [];
    this.switchesControl = config.switchesControl;
    this.switches = config.switches || [];

    //setup variables
    this.checkDeviceInfo = true;
    this.checkDeviceState = false;
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
    this.switchPortsCount = 0;
    this.exposedSwitchesCount = 0;

    //meraki url
    const BASE_API_URL = this.host + '/api/v1';
    this.networkUrl = '/networks/' + this.networkId;
    this.devicesUrl = '/organizations/' + this.organizationId + '/devices';
    this.dashboardClientsUrl = '/networks/' + this.networkId + '/clients';
    this.aplianceUrl = '/networks/' + this.networkId + '/appliance/ports';
    this.wirelessUrl = '/networks/' + this.networkId + '/wireless/ssids';

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
      fsPromises.mkdir(prefDir);
    }

    //Check network state
    setInterval(function () {
      const updateData = this.checkDeviceState ? this.updateDashboardClientsData() : false;
    }.bind(this), this.refreshInterval * 1000);

    this.updateDashboardClientsData();
  }

  async updateDashboardClientsData() {
    this.log.debug('Network: %s, requesting dashboardClientsData.', this.name);

    try {
      const dashboardClientsData = await this.axiosInstance.get(this.dashboardClientsUrl + '?perPage=255&timespan=2592000');
      this.log.debug('Debug dashboardClientsData: %s', dashboardClientsData.data[0]);

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

          const clientIndex = this.clientsMac.indexOf(configuredClientMac);
          const configuredClientId = (this.clientsId[clientIndex] != undefined) ? this.clientsId[clientIndex] : -1;

          //check and push existed clients in dshboard
          const exposeClient = (configuredClientId != -1 && configuredClientEnabled);
          const exposedAndExistongOnDashboardClientsName = exposeClient ? this.exposedAndExistongOnDashboardClientsName.push(configuredClientName) : false;
          const exposedAndExistongClientsOnDashboardId = exposeClient ? this.exposedAndExistingOnDashboardClientsId.push(configuredClientId) : false;
          const exposedAndExistongOnDashboardClientsMac = exposeClient ? this.exposedAndExistongOnDashboardClientsMac.push(configuredClientMac) : false;
          const exposedAndExistongOnDashboardClientsPolicy = exposeClient ? this.exposedAndExistongOnDashboardClientsPolicy.push(configuredClientPolicyType) : false;
        }

        const exposedAndExistingOnDaschboardClientsCount = this.exposedAndExistingOnDashboardClientsId.length;

        this.dashboardClientsCount = dashboardClientsCount;
        this.exposedAndExistingOnDaschboardClientsCount = exposedAndExistingOnDaschboardClientsCount;
        const updateDashboardClientsPolicy = (exposedAndExistingOnDaschboardClientsCount > 0) ? this.updateDashboardClientsPolicyData() : this.accessPointsControl ? this.updateWirelessData() : this.switchesControl ? this.updateSwitchData() : this.checkDeviceInfo ? this.getDeviceInfo() : false;
      }
    } catch (error) {
      this.log.error('Network: %s, dashboardClientsData error: %s', this.name, error);
      this.checkDeviceInfo = true;
    };
  }

  async updateDashboardClientsPolicyData() {
    this.log.debug('Network: %s, requesting dashboardClientsPolicyData.', this.name);

    try {
      this.clientsPolicyMac = new Array();
      this.clientsPolicyPolicy = new Array();
      this.clientsPolicyState = new Array();

      const exposedAndExistingOnDaschboardClientsCount = this.exposedAndExistingOnDaschboardClientsCount;
      for (let i = 0; i < exposedAndExistingOnDaschboardClientsCount; i++) {
        const configuredClientId = this.exposedAndExistingOnDashboardClientsId[i];

        const dashboardClientsPolicyData = await this.axiosInstance.get(this.dashboardClientsUrl + '/' + configuredClientId + '/policy');
        this.log.debug('Debug dashboardClientsPolicyData: %s', dashboardClientsPolicyData.data);

        if (dashboardClientsPolicyData.status == 200) {
          const clientPolicyMac = dashboardClientsPolicyData.data.mac;
          const clientPolicyPolicy = (dashboardClientsPolicyData.data.devicePolicy != undefined) ? (dashboardClientsPolicyData.data.devicePolicy) : 'undefined';
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

      const updateSwitchOrWirelessDataOrGetDeviceInfo = this.accessPointsControl ? this.updateWirelessData() : this.switchesControl ? this.updateSwitchData() : this.checkDeviceInfo ? this.getDeviceInfo() : false;
    } catch (error) {
      this.log.error('Network: %s, dashboardClientsPolicyData error: %s', this.name, error);
      this.checkDeviceInfo = true;
    };
  }

  async updateWirelessData() {
    this.log.debug('Network: %s, requesting ssidsData.', this.name);

    try {
      const ssidsData = await this.axiosInstance.get(this.wirelessUrl);
      this.log.debug('Debug ssidsData: %s', ssidsData.data);

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

        const updateSwitchDataOrGetDeviceInfo = this.switchesControl ? this.updateSwitchData() : this.checkDeviceInfo ? this.getDeviceInfo() : false;
      }
    } catch (error) {
      this.log.error('Network: %s, ssidsData error: %s', this.name, error);
      this.checkDeviceInfo = true;
    };
  }

  async updateSwitchData() {
    this.log.debug('Network: %s, requesting switchData.', this.name);

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
        const switchPortsUrl = '/devices/' + this.exposedSwitchesSerialNumber[i] + '/switch/ports';
        const switchPortsData = await this.axiosInstance.get(switchPortsUrl);
        this.log.debug('Debug switchPortsData: %s', switchPortsData.data);

        if (switchPortsData.status == 200) {
          const switchPortsCount = switchPortsData.data.length;
          for (let j = 0; j < switchPortsCount; j++) {
            const switchPortId = switchPortsData.data[j].portId;
            const switchPortName = switchPortsData.data[j].name;
            const switchPortState = (switchPortsData.data[j].enabled == true);
            const switchPortPoeState = (switchPortsData.data[j].poeEnabled == true);

            if (this.merakiSwitchServices) {
              this.merakiSwitchServices[j]
                .updateCharacteristic(Characteristic.On, switchPortState);
            }

            this.switchPortsId.push(switchPortId);
            this.switchPortsName.push(switchPortName);
            this.switchPortsState.push(switchPortState);
            this.switchPortsPoeState.push(switchPortPoeState);

          }
          this.switchPortsCount = switchPortsCount;
        }
      }
      this.exposedSwitchesCount = exposedSwitchesCount;
      const getDeviceInfo = (this.checkDeviceInfo && exposedSwitchesCount == 0) ? this.getDeviceInfo() : (this.checkDeviceInfo && this.switchPortsCount > 0) ? this.getDeviceInfo() : false;

    } catch (error) {
      this.log.error('Network: %s, switchPortsData error: %s', this.name, error);
      this.checkDeviceInfo = true;
    };
  }

  async getDeviceInfo() {
    try {
      this.log('-------- %s --------', this.name);
      this.log('Manufacturer: %s', 'Cisco/Meraki');
      this.log('Network: %s', this.name);
      this.log('Network Id: %s', this.networkId);
      this.log('Organization Id: %s', this.organizationId);
      this.log('----------------------------------');

      this.checkDeviceInfo = false;
      this.checkDeviceState = true;
      const startPrepareAccessory = this.startPrepareAccessory ? this.prepareAccessory() : false;
    } catch (error) {
      this.log.error('Network: %s, getDeviceInfo error: %s', this.name, error);
      this.checkDeviceInfo = true;
    }
  }

  //Prepare accessory
  prepareAccessory() {
    this.log.debug('prepareAccessory');
    const accessoryName = this.name;
    const accessoryUUID = UUID.generate(this.networkId);
    const accessoryCategory = Categories.AIRPORT;
    const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);
    accessory.context.device = this.config.device;

    //Prepare information service
    this.log.debug('prepareInformationService');
    const manufacturer = 'Cisco/Meraki';
    const modelName = accessoryName;
    const serialNumber = this.networkId;
    const firmwareRevision = this.organizationId;

    accessory.removeService(accessory.getService(Service.AccessoryInformation));
    const informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, manufacturer)
      .setCharacteristic(Characteristic.Model, modelName)
      .setCharacteristic(Characteristic.SerialNumber, serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);
    accessory.addService(informationService);

    //Prepare service 
    this.log.debug('prepareMerakiService');

    //get devices data variables
    const exposedAndExistingOnDaschboardClientsCount = this.exposedAndExistingOnDaschboardClientsCount;
    const exposedSsidsCount = this.exposedSsidsCount;
    const exposedSwitchesCount = this.exposedSwitchesCount;
    const switchPortsCount = this.switchPortsCount;

    this.merakiDashboardClientPolicyServices = new Array();
    for (let i = 0; i < exposedAndExistingOnDaschboardClientsCount; i++) {
      const clientName = this.exposedAndExistongOnDashboardClientsName[i];
      const exposedClientName = 'C. ' + clientName;

      const merakiDashboardClientPolicyService = new Service.Switch(exposedClientName, 'merakiDashboardClientPolicyService' + i);
      merakiDashboardClientPolicyService.getCharacteristic(Characteristic.On)
        .onGet(async () => {
          const state = (this.clientsPolicyState[i] != undefined) ? this.clientsPolicyState[i] : true;
          const policy = state ? this.clientsPolicyPolicy[i] : 'Blocked';
          if (!this.disableLogInfo) {
            this.log('Network: %s, Client: %s, Policy: %s', accessoryName, clientName, policy);
          }
          return state;
        })
        .onSet(async (state) => {
          try {
            const clientId = this.exposedAndExistingOnDashboardClientsId[i];
            const policy = state ? this.exposedAndExistongOnDashboardClientsPolicy[i] : 'Blocked';
            const setClientPolicy = await this.axiosInstance.put(this.dashboardClientsUrl + '/' + clientId + '/policy', {
              'devicePolicy': policy
            });
            this.log.debug('Network: %s, Client: %s, debug setClientPolicy: %s', accessoryName, clientName, setClientPolicy.data);
            if (!this.disableLogInfo) {
              this.log('Network: %s, Client: %s, set Policy: %s', accessoryName, clientName, policy);
            }
            this.updateDashboardClientsData();
          } catch (error) {
            this.log.error(('Network: %s, Client: %s, set Policy error: %s', accessoryName, clientName, error));
          }
        });

      this.merakiDashboardClientPolicyServices.push(merakiDashboardClientPolicyService);
      accessory.addService(this.merakiDashboardClientPolicyServices[i]);
    }

    this.merakiWirelessServices = new Array();
    for (let i = 0; i < exposedSsidsCount; i++) {
      const ssidName = this.exposedSsidsName[i];
      const exposedSsidName = 'W. ' + ssidName;

      const merakiWirelessService = new Service.Switch(exposedSsidName, 'merakiWirelessService' + i);
      merakiWirelessService.getCharacteristic(Characteristic.On)
        .onGet(async () => {
          const state = this.exposedSsidsState[i];
          if (!this.disableLogInfo) {
            this.log('Network: %s, SSID: %s, state: %s', accessoryName, ssidName, state ? 'Enabled' : 'Disabled');
          }
          return state;
        })
        .onSet(async (state) => {
          try {
            state = state ? true : false;
            const ssidIndex = this.ssidsName.indexOf(ssidName);
            const setSsid = await this.axiosInstance.put(this.wirelessUrl + '/' + ssidIndex, {
              'enabled': state
            });
            this.log.debug('Network: %s, SSID: %s, debug setSsid: %s', accessoryName, ssidName, setSsid.data);
            if (!this.disableLogInfo) {
              this.log('Network: %s, SSID: %s, set state: %s', accessoryName, ssidName, state ? 'Enabled' : 'Disabled');
            }
            this.updateWirelessData();
          } catch (error) {
            this.log.error(('Network: %s, SSID: %s, set state error: %s', accessoryName, ssidName, error));
          }
        });

      this.merakiWirelessServices.push(merakiWirelessService);
      accessory.addService(this.merakiWirelessServices[i]);
    }

    //meraki ms
    if (exposedSwitchesCount > 0) {
      this.merakiSwitchServices = new Array();
      for (let i = 0; i < switchPortsCount; i++) {
        const switchPortName = this.switchPortsName[i];
        const switchPortId = this.switchPortsId[i];
        const exposedSwitchPortName = switchPortId + '. ' + switchPortName;

        const merakiSwitchService = new Service.Switch(exposedSwitchPortName, 'merakiSwitchService' + i);
        merakiSwitchService.getCharacteristic(Characteristic.On)
          .onGet(async () => {
            const state = this.switchPortsState[i] != undefined ? this.switchPortsState[i] : false;
            if (!this.disableLogInfo) {
              this.log('Network: %s, Port: %s, Name: %s, state: %s', accessoryName, switchPortId, switchPortName, state ? 'Enabled' : 'Disabled');
            }
            return state;
          })
          .onSet(async (state) => {
            try {
              state = state ? true : false;
              const switchPortId = this.switchPortsId[i];
              const switchPortUrl = '/devices/' + this.switches[0].serialNumber + '/switch/ports/' + switchPortId;
              const setSwitchPort = await this.axiosInstance.put(switchPortUrl, {
                'enabled': state
              });
              this.log.debug('Network: %s, Port: %s, Name: %s, debug setSwitchPort: %s', accessoryName, switchPortId, switchPortName, setSwitchPort.data);
              if (!this.disableLogInfo) {
                this.log('Network: %s, Port: %s, Name: %s, set state: %s', accessoryName, switchPortId, switchPortName, state ? 'Enabled' : 'Disabled');
              }
              this.updateSwitchData();
            } catch (error) {
              this.log.error(('Network: %s, Port: %s, Name: %s, set state error: %s', accessoryName, switchPortId, switchPortName, error));
            }
          });

        this.merakiSwitchServices.push(merakiSwitchService);
        accessory.addService(this.merakiSwitchServices[i]);
      }
    }

    this.startPrepareAccessory = false;
    this.log.debug('Network: %s, publishExternalAccessories.', accessoryName);
    this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
  }
}