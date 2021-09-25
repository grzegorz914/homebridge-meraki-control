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
    this.hideUnconfiguredSsids = config.hideUnconfiguredSsids;
    this.hideSsidByName = config.hideSsidByName || [];
    this.dashboardClientsPolicy = config.dashboardClientsPolicy || [];

    //setup variables
    this.checkDeviceInfo = true;
    this.checkDeviceState = false;
    this.startPrepareAccessory = true;

    //meraki dashboard
    this.dashboardClientsCount = 0;
    this.configuredDashboardClientsCount = this.dashboardClientsPolicy.length;
    this.exposedAndExistingDaschboardClientsCount = 0;

    //meraki mr
    this.wirelessSsidsCount = 0;
    this.configuredHiddenSsidsCount = this.hideSsidByName.length;
    this.exposedSsidsCount = 0;

    //meraki url
    const BASE_API_URL = this.host + '/api/v1';
    this.networkUrl = '/networks/' + this.networkId;
    this.devicesUrl = '/organizations/' + this.organizationId + '/devices';
    this.dashboardClientsUrl = '/networks/' + this.networkId + '/clients';
    this.aplianceUrl = '/networks/' + this.networkId + '/appliance/ports';
    this.wirelessUrl = '/networks/' + this.networkId + '/wireless/ssids';
    this.switchUrl = '/devices/' + this.serialNumber + '/switch/ports';
    this.cameraUrl = '/devices/' + this.serialNumber + '/camera';

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
          const clientMac = dashboardClientsData.data[i].mac;
          const clientDescription = dashboardClientsData.data[i].description;

          this.clientsId.push(clientId);
          this.clientsMac.push(clientMac);
          this.clientsDescription.push(clientDescription);
        }

        //configured clients
        this.exposedAndExistongClientsOnDashboardName = new Array();
        this.exposedAndExistingClientsOnDashboardId = new Array();
        this.exposedAndExistongClientsOnDashboardMac = new Array();
        this.exposedAndExistongClientsOnDashboardType = new Array();

        for (let j = 0; j < this.configuredDashboardClientsCount; j++) {
          const clientName = this.dashboardClientsPolicy[j].name;
          const clientMac = this.dashboardClientsPolicy[j].mac;
          const clientPolicyType = this.dashboardClientsPolicy[j].type;
          const clientEnabled = this.dashboardClientsPolicy[j].mode;

          const clientIndex = this.clientsMac.indexOf(clientMac);
          const configuredClientId = this.clientsId[clientIndex];

          //check and push existed clients in dshboard
          const exposedAndExistongClientsOnDashboardName = (this.clientsId.indexOf(configuredClientId) >= 0 && clientEnabled) ? this.exposedAndExistongClientsOnDashboardName.push(clientName) : false;
          const exposedAndExistongClientsOnDashboardId = (this.clientsId.indexOf(configuredClientId) >= 0 && clientEnabled) ? this.exposedAndExistingClientsOnDashboardId.push(configuredClientId) : false;
          const exposedAndExistongClientsOnDashboardMac = (this.clientsId.indexOf(configuredClientId) >= 0 && clientEnabled) ? this.exposedAndExistongClientsOnDashboardMac.push(clientMac) : false;
          const exposedAndExistongClientsOnDashboardType = (this.clientsId.indexOf(configuredClientId) >= 0 && clientEnabled) ? this.exposedAndExistongClientsOnDashboardType.push(clientPolicyType) : false;
        }
        this.dashboardClientsCount = dashboardClientsCount;
        this.exposedAndExistingDaschboardClientsCount = this.exposedAndExistingClientsOnDashboardId.length;
        this.updateDashboardClientsPolicyData();
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

      const exposedAndExistingDaschboardClientsCount = this.exposedAndExistingDaschboardClientsCount;
      for (let i = 0; i < exposedAndExistingDaschboardClientsCount; i++) {
        const configuredClientId = this.exposedAndExistingClientsOnDashboardId[i];
        const configuredClientPolicyType = this.exposedAndExistongClientsOnDashboardType[i];

        const dashboardClientsPolicyData = await this.axiosInstance.get(this.dashboardClientsUrl + '/' + configuredClientId + '/policy');
        this.log.debug('Debug dashboardClientsPolicyData: %s', dashboardClientsPolicyData.data);

        if (dashboardClientsPolicyData.status == 200) {
          const clientPolicyMac = dashboardClientsPolicyData.data.mac;
          const clientPolicyPolicy = (dashboardClientsPolicyData.data.devicePolicy != undefined) ? (dashboardClientsPolicyData.data.devicePolicy) : undefined;
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

      this.updateWirelessData();
    } catch (error) {
      this.log.error('Network: %s, dashboardClientsPolicyData error: %s', this.name, error);
      this.checkDeviceInfo = true;
    };
  }

  async updateWirelessData() {
    this.log.debug('Network: %s, requesting wirelessData.', this.name);

    try {
      const wirelessData = await this.axiosInstance.get(this.wirelessUrl);
      this.log.debug('Debug merakiMrData: %s', wirelessData.data[0]);

      if (wirelessData.status == 200) {
        this.wirelessSsidsName = new Array();
        this.wirelessSsidsState = new Array();
        this.hiddenSsidsName = new Array();
        this.exposedSsidsName = new Array();
        this.exposedSsidsState = new Array();

        const configuredHiddenSsidsCount = this.configuredHiddenSsidsCount;
        const wirelessSsidsCount = wirelessData.data.length;

        for (let j = 0; j < configuredHiddenSsidsCount; j++) {
          const hiddenSsidName = this.hideSsidByName[j].name;
          const hiddenSsidEnabled = (this.hideSsidByName[j].mode == true);

          //push ssids
          const hiddenSsidsName = (hiddenSsidEnabled && hiddenSsidName != undefined) ? this.hiddenSsidsName.push(hiddenSsidName) : false;
        }

        for (let i = 0; i < wirelessSsidsCount; i++) {
          const ssidName = wirelessData.data[i].name;
          const ssidState = (wirelessData.data[i].enabled == true)
          this.wirelessSsidsName.push(ssidName);
          this.wirelessSsidsState.push(ssidState);

          const showConfiguredSsids = this.hideUnconfiguredSsids ? (ssidName.substr(0, 12) != 'Unconfigured') : true;
          if (showConfiguredSsids) {
            const hideSsidsName = (this.hiddenSsidsName.indexOf(ssidName) >= 0);
            const pushName = hideSsidsName ? false : this.exposedSsidsName.push(ssidName);
            const pushState = hideSsidsName ? false : this.exposedSsidsState.push(ssidState);
          }
        }

        const exposedSsidsCount = this.exposedSsidsName.length;
        for (let i = 0; i < exposedSsidsCount; i++) {
          const ssidState = (this.exposedSsidsState[i] == true);

          if (this.merakiWirelessServices && (ssidState != undefined)) {
            this.merakiWirelessServices[i]
              .updateCharacteristic(Characteristic.On, ssidState);
          }
        }
        this.wirelessSsidsCount = wirelessSsidsCount;
        this.exposedSsidsCount = exposedSsidsCount;

        const getDeviceInfo = this.checkDeviceInfo ? this.getDeviceInfo() : false;
      }
    } catch (error) {
      this.log.error('Network: %s, wirelessData error: %s', this.name, error);
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
    const exposedAndExistingDaschboardClientsCount = this.exposedAndExistingDaschboardClientsCount;
    const exposedSsidsCount = this.exposedSsidsCount;

    this.merakiDashboardClientPolicyServices = new Array();
    for (let i = 0; i < exposedAndExistingDaschboardClientsCount; i++) {
      const clientName = this.exposedAndExistongClientsOnDashboardName[i];
      const merakiDashboardClientPolicyService = new Service.Switch(clientName, 'merakiDashboardClientPolicyService' + i);
      merakiDashboardClientPolicyService.getCharacteristic(Characteristic.On)
        .onGet(async () => {
          const state = (this.clientsPolicyState[i] != undefined) ? this.clientsPolicyState[i] : true;
          if (!this.disableLogInfo) {
            this.log('Network: %s, client: %s, get policy, state: %s', accessoryName, clientName, state ? 'Normal' : 'Blocked');
          }
          return state;
        })
        .onSet(async (state) => {
          try {
            const clientId = this.exposedAndExistingClientsOnDashboardId[i];
            const clientPolicyType = this.exposedAndExistongClientsOnDashboardType[i];
            const policy = state ? clientPolicyType : 'Blocked';
            const setClientPolicy = await this.axiosInstance.put(this.dashboardClientsUrl + '/' + clientId + '/policy', {
              'devicePolicy': policy
            });
            this.log.debug('Network: %s, client: %s, debug setClientPolicy: %s', accessoryName, clientName, setClientPolicy.data);
            if (!this.disableLogInfo) {
              this.log('Network: %s, client: %s, set policy, state: %s', accessoryName, clientName, policy);
            }
            this.updateDashboardClientsData();
          } catch (error) {
            this.log.error(('Network: %s, client: %s, set policy, error: %s', accessoryName, clientName, error));
          }
        });

      this.merakiDashboardClientPolicyServices.push(merakiDashboardClientPolicyService);
      accessory.addService(this.merakiDashboardClientPolicyServices[i]);
    }

    this.merakiWirelessServices = new Array();
    for (let i = 0; i < exposedSsidsCount; i++) {
      const ssidName = this.exposedSsidsName[i];

      const merakiWirelessService = new Service.Switch(ssidName, 'merakiWirelessService' + i);
      merakiWirelessService.getCharacteristic(Characteristic.On)
        .onGet(async () => {
          const state = this.exposedSsidsState[i];
          if (!this.disableLogInfo) {
            this.log('Network: %s, SSIDs: %s, get state: %s', accessoryName, ssidName, state ? 'Enabled' : 'Disabled');
          }
          return state;
        })
        .onSet(async (state) => {
          try {
            state = state ? true : false;
            const ssidIndex = this.wirelessSsidsName.indexOf(ssidName);
            const setSsid = await this.axiosInstance.put(this.wirelessUrl + '/' + ssidIndex, {
              'enabled': state
            });
            this.log.debug('Network: %s, SSID: %s, debug setSsid: %s', accessoryName, ssidName, setSsid.data);
            if (!this.disableLogInfo) {
              this.log('Network: %s, SSID: %s, set state: %s', accessoryName, ssidName, state ? 'Enabled' : 'Disabled');
            }
            this.updateDashboardClientsData();
          } catch (error) {
            this.log.error(('Network: %s, SSID: %s, set  error: %s', accessoryName, ssidName, error));
          }
        });

      this.merakiWirelessServices.push(merakiWirelessService);
      accessory.addService(this.merakiWirelessServices[i]);
    }

    this.startPrepareAccessory = false;
    this.log.debug('Network: %s, publishExternalAccessories.', accessoryName);
    this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
  }
}