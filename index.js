'use strict';

const path = require('path');
const axios = require('axios').default;
const fs = require('fs');
const fsPromises = require('fs').promises;

const PLUGIN_NAME = 'homebridge-meraki-control';
const PLATFORM_NAME = 'Meraki';

const BASE_API_URL = 'https://api.meraki.com/api/v1'

let Accessory, Characteristic, Service, Categories, AccessoryUUID;

module.exports = (api) => {
  Accessory = api.platformAccessory;
  Characteristic = api.hap.Characteristic;
  Service = api.hap.Service;
  Categories = api.hap.Categories;
  AccessoryUUID = api.hap.uuid;
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
    this.api = api;

    //network configuration
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.organizationId = config.organizationId;
    this.networkId = config.networkId;
    this.refreshInterval = config.refreshInterval || 5;
    this.disableLogInfo = config.disableLogInfo;
    this.hideUnconfiguredSsids = config.hideUnconfiguredSsids;
    this.hideSsidByName = config.hideSsidByName || [];
    this.getClientByNameOrMac = config.getClientByNameOrMac || [];

    //get Device info
    this.manufacturer = 'Meraki';
    this.modelName = this.name || 'Network Name';
    this.serialNumber = this.networkId || 'Network ID';
    this.firmwareRevision = this.organizationId || 'Organization ID';

    //setup variables
    this.checkDeviceInfo = false;
    this.checkDeviceState = false;
    this.startPrepareAccessory = true;

    //data
    this.networkData = {
      'status': 0
    };
    this.devicesData = {
      'status': 0
    };
    this.dashboardClientsData = {
      'status': 0
    };
    this.aplianceData = {
      'status': 0
    };
    this.wirelessData = {
      'status': 0
    };
    this.switchData = {
      'status': 0
    };
    this.cameraData = {
      'status': 0
    };

    //meraki dashboard
    this.dashboardClientsCount = 0;
    this.configuredClientsByNameCount = (this.getClientByNameOrMac.length != undefined) ? this.getClientByNameOrMac.length : 0;
    this.exposedAndExistingClientsOnDashboardCount = 0;

    //meraki mr
    this.wirelessSsidsCount = 0;
    this.configuredHiddenSsidsCount = (this.hideSsidByName.length != undefined) ? this.hideSsidByName.length : 0;

    //meraki url
    this.networkUrl = BASE_API_URL + '/networks/' + this.networkId;
    this.devicesUrl = BASE_API_URL + '/organizations/' + this.organizationId + '/devices';
    this.dashboardClientsUrl = BASE_API_URL + '/networks/' + this.networkId + '/clients';
    this.aplianceUrl = BASE_API_URL + '/networks/' + this.networkId + '/appliance/ports';
    this.wirelessUrl = BASE_API_URL + '/networks/' + this.networkId + '/wireless/ssids';
    this.switchUrl = BASE_API_URL + '/devices/' + this.serialNumber + '/switch/ports';
    this.cameraUrl = BASE_API_URL + '/devices/' + this.serialNumber + '/camera';

    this.meraki = axios.create({
      baseURL: BASE_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Cisco-Meraki-API-Key': this.apiKey
      }
    });

    //preferences directory
    this.prefDir = path.join(api.user.storagePath(), 'meraki');

    //check if prefs directory exist
    if (fs.existsSync(this.prefDir) == false) {
      fsPromises.mkdir(this.prefDir);
    }

    //Check network state
    setInterval(function () {
      if (this.checkDeviceInfo || this.checkDeviceState) {
        this.updateDashboardClientsData();
      }
    }.bind(this), this.refreshInterval * 1000);

    this.updateDashboardClientsData();
  }

  async updateDashboardClientsData() {
    this.log.debug('Network: %s, requesting dashboardClientsData.', this.name);
    try {
      const dashboardClientsData = await this.meraki.get(this.dashboardClientsUrl + '?perPage=255&timespan=2592000');
      this.log.debug('Debug dashboardClientsData: %s', dashboardClientsData.data[0]);
      const dashboardClientsCount = dashboardClientsData.data.length;

      this.dashboardClientsData = dashboardClientsData;
      this.dashboardClientsCount = dashboardClientsCount;

      this.updateWirelessData();
    } catch (error) {
      this.log.error('Network: %s, dashboardClientsData error: %s', this.name, error);
      this.checkDeviceState = false;
      this.checkDeviceInfo = true;
    };
  }

  async updateWirelessData() {
    this.log.debug('Network: %s, requesting wirelessData.', this.name);
    try {
      const wirelessData = await this.meraki.get(this.wirelessUrl);
      this.log.debug('Debug merakiMrData: %s', wirelessData.data[0]);
      const wirelessSsidsCount = wirelessData.data.length;

      this.wirelessData = wirelessData;
      this.wirelessSsidsCount = wirelessSsidsCount;

      const getDeviceInfo = !this.checkDeviceState ? this.getDeviceInfo() : this.updateDeviceState();
    } catch (error) {
      this.log.error('Network: %s, wirelessData error: %s', this.name, error);
      this.checkDeviceState = false;
      this.checkDeviceInfo = true;
    };
  }

  getDeviceInfo() {
    try {
      this.log('Network: %s, state: Online.', this.name);
      this.log('-------- %s --------', this.name);
      this.log('Manufacturer: %s', this.manufacturer);
      this.log('Model: %s', this.modelName);
      this.log('Serialnr: %s', this.serialNumber);
      this.log('Firmware: %s', this.firmwareRevision);
      this.log('----------------------------------');

      this.checkDeviceInfo = false;
      this.updateDeviceState();
    } catch (error) {
      this.log.error('Network: %s, getDeviceInfo error: %s', this.name, error);
      this.checkDeviceState = false;
      this.checkDeviceInfo = true;
    }
  }

  async updateDeviceState() {
    this.log.debug('Network: %s, update state.', this.name);
    try {
      //get networks data;
      const dashboardClientsData = this.dashboardClientsData;
      const wirelessData = this.wirelessData;

      //get devices data variables
      const dashboardClientsCount = this.dashboardClientsCount;
      const configuredClientsByNameCount = this.configuredClientsByNameCount;
      const wirelessSsidsCount = this.wirelessSsidsCount;
      const configuredHiddenSsidsCount = this.configuredHiddenSsidsCount;

      //daschboard clients
      if (dashboardClientsData.status == 200) {
        this.clientsId = new Array();
        this.clientsMac = new Array();
        this.clientsDescription = new Array();

        for (let i = 0; i < dashboardClientsCount; i++) {
          const clientId = dashboardClientsData.data[i].id;
          const clientMac = dashboardClientsData.data[i].mac;
          const clientDescription = dashboardClientsData.data[i].description;

          this.clientsId.push(clientId);
          this.clientsMac.push(clientMac);
          this.clientsDescription.push(clientDescription);
        }

        //client configured
        this.exposedAndExistingClientsOnDashboardId = new Array();
        this.exposedAndExistongClientsOnDashboardMac = new Array();
        this.exposedAndExistongClientsOnDashboardDescription = new Array();
        this.exposedAndExistongClientsOnDashboardCustomName = new Array();

        for (let j = 0; j < configuredClientsByNameCount; j++) {
          const clientMode = (this.getClientByNameOrMac[j].mode == true);
          const clientNameOrMac = this.getClientByNameOrMac[j].name;
          const clientCustomName = this.getClientByNameOrMac[j].customName;
          const clientsByNameOrMac = clientMode ? this.clientsMac : this.clientsDescription;

          const clientIndex = clientsByNameOrMac.indexOf(clientNameOrMac);
          const configuredClientId = this.clientsId[clientIndex];
          const configuredClientMac = this.clientsMac[clientIndex];
          const configuredClientDescription = this.clientsDescription[clientIndex];

          //check client exist in dshboard
          const exposedAndExistongClientOnDashboardId = (this.clientsId.indexOf(configuredClientId) >= 0) ? this.exposedAndExistingClientsOnDashboardId.push(configuredClientId) : false;
          const exposedAndExistongClientOnDashboardMac = (this.clientsId.indexOf(configuredClientId) >= 0) ? this.exposedAndExistongClientsOnDashboardMac.push(configuredClientMac) : false;
          const exposedAndExistongClientOnDashboardDescription = (this.clientsId.indexOf(configuredClientId) >= 0) ? this.exposedAndExistongClientsOnDashboardDescription.push(configuredClientDescription) : false;
          const exposedAndExistongClientsOnDashboardCustomName = (this.clientsId.indexOf(configuredClientId) >= 0) ? (clientMode && clientCustomName != undefined) ? this.exposedAndExistongClientsOnDashboardCustomName.push(clientCustomName) : this.exposedAndExistongClientsOnDashboardCustomName.push(configuredClientDescription) : false;
        }
      }

      //cliects policy
      try {
        this.clientsPolicyMac = new Array();
        this.clientsPolicyPolicy = new Array();
        this.clientsPolicyState = new Array();

        const exposedAndExistingClientsOnDashboardCount = this.exposedAndExistingClientsOnDashboardId.length;
        this.exposedAndExistingClientsOnDashboardCount = exposedAndExistingClientsOnDashboardCount;
        for (let k = 0; k < exposedAndExistingClientsOnDashboardCount; k++) {
          const clientId = this.exposedAndExistingClientsOnDashboardId[k];
          const dashboardClientsPolicyData = await this.meraki.get(this.dashboardClientsUrl + '/' + clientId + '/policy');
          this.log.debug('Debug dashboardClientsPolicyData: %s', dashboardClientsPolicyData.data);

          if (dashboardClientsPolicyData.status == 200) {
            const clientPolicyMac = dashboardClientsPolicyData.data.mac;
            const clientPolicyPolicy = (dashboardClientsPolicyData.data.devicePolicy != undefined) ? (dashboardClientsPolicyData.data.devicePolicy) : 'Normal';
            const clientPolicyState = (clientPolicyPolicy == 'Normal' || clientPolicyPolicy == 'Whitelisted');

            if (this.merakiDashboardClientPolicyServices && clientPolicyPolicy != undefined) {
              this.merakiDashboardClientPolicyServices[k]
                .updateCharacteristic(Characteristic.On, clientPolicyState);
            }

            this.clientsPolicyMac.push(clientPolicyMac);
            this.clientsPolicyPolicy.push(clientPolicyPolicy);
            this.clientsPolicyState.push(clientPolicyState);
          }
        }
      } catch (error) {
        this.log.error('Network: %s, dashboardClientsPolicyData error: %s', this.name, error);
      }

      //SSIDs
      if (wirelessData.status == 200) {
        this.wirelessSsidsName = new Array();
        this.wirelessSsidsState = new Array();
        this.hiddenSsidsName = new Array();
        this.exposedSsidsName = new Array();
        this.exposedSsidsState = new Array();

        for (let j = 0; j < configuredHiddenSsidsCount; j++) {
          const hiddenSsidByNameName = this.hideSsidByName[j].name;
          const hiddenSsidByNameMode = (this.hideSsidByName[j].mode == true);
          const push = hiddenSsidByNameMode ? this.hiddenSsidsName.push(hiddenSsidByNameName) : false;
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
        this.exposedSsidsCount = exposedSsidsCount;
      }
      this.checkDeviceState = true;

      //start prepare accessory
      if (this.startPrepareAccessory) {
        this.prepareAccessory();
      }
    } catch (error) {
      this.log.error('Network: %s, update Device state error: %s', this.name, error);
      this.checkDeviceState = false;
      this.checkDeviceInfo = true;
    }
  }

  //Prepare accessory
  prepareAccessory() {
    this.log.debug('prepareAccessory');
    const accessoryName = this.name;
    const accessoryUUID = AccessoryUUID.generate(accessoryName);
    const accessoryCategory = Categories.AIRPORT;
    const accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

    //Prepare information service
    this.log.debug('prepareInformationService');
    const manufacturer = this.manufacturer;
    const modelName = this.modelName;
    const serialNumber = this.serialNumber;
    const firmwareRevision = this.firmwareRevision;

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
    const exposedAndExistingClientsOnDashboardCount = this.exposedAndExistingClientsOnDashboardCount;
    const exposedSsidsCount = this.exposedSsidsCount;

    this.merakiDashboardClientPolicyServices = new Array();
    for (let i = 0; i < exposedAndExistingClientsOnDashboardCount; i++) {
      const clientNameToBeExposed = this.exposedAndExistongClientsOnDashboardCustomName[i];

      const merakiDashboardClientPolicyService = new Service.Switch(clientNameToBeExposed, 'merakiDashboardClientPolicyService' + i);
      merakiDashboardClientPolicyService.getCharacteristic(Characteristic.On)
        .onGet(async () => {
          const state = (this.clientsPolicyState[i] != undefined) ? this.clientsPolicyState[i] : true;
          if (!this.disableLogInfo) {
            this.log('Network: %s, client: %s, get policy, state: %s', accessoryName, clientNameToBeExposed, state ? 'Normal' : 'Blocked');
          }
          return state;
        })
        .onSet(async (state) => {
          const policy = state ? 'Normal' : 'Blocked';
          const clientId = this.exposedAndExistingClientsOnDashboardId[i];
          const setClientPolicy = await this.meraki.put(this.dashboardClientsUrl + '/' + clientId + '/policy', {
            'devicePolicy': policy
          });
          this.log.debug('Network: %s, client: %s, debug setClientPolicy: %s', accessoryName, clientNameToBeExposed, setClientPolicy.data);
          if (!this.disableLogInfo) {
            this.log('Network: %s, client: %s, set policy, state: %s', accessoryName, clientNameToBeExposed, policy);
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
          state = state ? true : false;
          const ssidIndex = this.wirelessSsidsName.indexOf(ssidName);
          const setSsid = await this.meraki.put(this.wirelessUrl + '/' + ssidIndex, {
            'enabled': state
          });
          this.log.debug('Network: %s, SSID: %s, debug setSsid: %s', accessoryName, ssidName, setSsid);
          if (!this.disableLogInfo) {
            this.log('Network: %s, SSID: %s, set state: %s', accessoryName, ssidName, state ? 'Enabled' : 'Disabled');
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