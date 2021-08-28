'use strict';

const path = require('path');
const axios = require('axios').default;
const fs = require('fs');
const fsPromises = require('fs').promises;

const PLUGIN_NAME = 'homebridge-meraki-control';
const PLATFORM_NAME = 'Meraki';

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

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching');
      for (let i = 0; i < this.devices.length; i++) {
        const deviceName = this.devices[i];
        if (!deviceName.name) {
          this.log.warn('Device Name Missing');
        } else {
          new merakiDevice(this.log, deviceName, this.api);
        }
      }
    });

  }

  configureAccessory(platformAccessory) {
    this.log.debug('configurePlatformAccessory');
  }

  removeAccessory(platformAccessory) {
    this.log.debug('removePlatformAccessory');
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platformAccessory]);
  }
}

class merakiDevice {
  constructor(log, config, api) {
    this.log = log;
    this.api = api;
    this.config = config;


    //device configuration
    this.name = config.name;
    this.host = config.host;
    this.apiKey = config.apiKey;
    this.organizationId = config.organizationId;
    this.networkId = config.networkId;
    this.refreshInterval = config.refreshInterval || 5;
    this.disableLogInfo = config.disableLogInfo;
    this.hideUnconfiguredSsids = config.hideUnconfiguredSsids;
    this.hideSsidByName = config.hideSsidByName || [];
    this.getClientByName = config.getClientByName || [];

    //get Device info
    this.manufacturer = config.manufacturer || 'Cisco/Meraki';
    this.modelName = config.modelName || 'Model Name';
    this.serialNumber = config.serialNumber || 'Serial Number';
    this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

    //setup variables
    this.checkDeviceInfo = false;
    this.checkDeviceState = false;
    this.startPrepareAccessory = true;

    //data
    this.merakiDashboardClientsData = {
      'status': 0
    };
    this.merakiMrSsidsData = {
      'status': 0
    };

    //meraki dashboard
    this.merakiDashboardClientsCount = 0;
    this.exposedClientByNameCount = this.getClientByName.length;
    this.showClientsByName = false;

    //meraki mr
    this.allSsidsCount = 0;
    this.exposedSsidsCount = 0;
    this.hiddenSsidsCount = this.hideSsidByName.length;

    this.prefDir = path.join(api.user.storagePath(), 'meraki');
    this.dashboardClientsUrl = this.host + '/api/v1/networks/' + this.networkId + '/clients?perPage=255';
    this.mxUrl = this.host + '/api/v1/networks/' + this.networkId + '/appliance/ports';
    this.mrSsidUrl = this.host + '/api/v1/networks/' + this.networkId + '/wireless/ssids';
    this.msUrl = this.host + '/api/v1/devices/' + this.serialNumber + '/switch/ports';
    this.mvUrl = this.host + '/api/v1/devices/' + this.serialNumber + '/camera';

    this.meraki = axios.create({
      baseURL: this.host,
      headers: {
        'X-Cisco-Meraki-API-Key': this.apiKey,
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json'
      }
    });

    //check if prefs directory ends with a /, if not then add it
    if (fs.existsSync(this.prefDir) == false) {
      fsPromises.mkdir(this.prefDir);
    }

    //Check device state
    setInterval(function () {
      if (this.checkDeviceInfo || this.checkDeviceState) {
        this.updateMerakiDashboardClientsData();
      }
    }.bind(this), this.refreshInterval * 1000);

    this.updateMerakiDashboardClientsData();
  }

  async updateMerakiDashboardClientsData() {
    this.log.debug('Device: %s %s, requesting merakiDashboardClientsData.', this.host, this.name);
    try {
      const merakiDashboardClientsData = await this.meraki.get(this.dashboardClientsUrl);
      this.log.debug('Debug merakiDashboardClientsData: %s', merakiDashboardClientsData.data[0]);
      const merakiDashboardClientsCount = merakiDashboardClientsData.data.length;

      this.merakiDashboardClientsData = merakiDashboardClientsData;
      this.merakiDashboardClientsCount = merakiDashboardClientsCount;

      this.updateMerakiMrSsidsData();
    } catch (error) {
      this.log.error('Device: %s %s, merakiDashboardClientsData error: %s', this.host, this.name, error);
      this.checkDeviceState = false;
      this.checkDeviceInfo = true;
    };
  }

  async updateMerakiMrSsidsData() {
    this.log.debug('Device: %s %s, requesting merakiMrSsidsData.', this.host, this.name);
    try {
      const merakiMrSsidsData = await this.meraki.get(this.mrSsidUrl);
      this.log.debug('Debug merakiMrData: %s', merakiMrSsidsData.data[0]);
      const allSsidsCount = merakiMrSsidsData.data.length;

      this.merakiMrSsidsData = merakiMrSsidsData;
      this.allSsidsCount = allSsidsCount;

      const getDeviceInfo = !this.checkDeviceState ? this.getDeviceInfo() : this.updateDeviceState();
    } catch (error) {
      this.log.error('Device: %s %s, merakiMrSsidsData error: %s', this.host, this.name, error);
      this.checkDeviceState = false;
      this.checkDeviceInfo = true;
    };
  }

  getDeviceInfo() {
    try {
      this.log('Device: %s, state: Online.', this.name);
      this.log('-------- %s --------', this.name);
      this.log('Manufacturer: %s', this.manufacturer);
      this.log('Model: %s', this.modelName);
      this.log('Serialnr: %s', this.serialNumber);
      this.log('Firmware: %s', this.firmwareRevision);
      this.log('----------------------------------');

      this.checkDeviceInfo = false;
      this.updateDeviceState();
    } catch (error) {
      this.log.error('Device: %s, getDeviceInfo error: %s', this.name, error);
      this.checkDeviceState = false;
      this.checkDeviceInfo = true;
    }
  }

  async updateDeviceState() {
    this.log.debug('Device: %s %s, update device state.', this.host, this.name);
    try {
      //get devices data;
      const merakiDashboardClientsData = this.merakiDashboardClientsData;
      const merakiMrSsidsData = this.merakiMrSsidsData;

      //get devices data variables
      const merakiDashboardClientsCount = this.merakiDashboardClientsCount;
      const exposedClientByNameCount = this.exposedClientByNameCount;
      const allSsidsCount = this.allSsidsCount;
      const hiddenSsidsCount = this.hiddenSsidsCount;


      //daschboards filter clients
      if (merakiDashboardClientsData.status == 200) {
        this.allClientsName = new Array();
        this.clientsId = new Array();
        this.clientsUser = new Array();
        this.clientsPolicyMac = new Array();
        this.clientsPolicyPolicy = new Array();
        this.clientsPolicyGroupPolicyId = new Array();
        this.clientsPolicyState = new Array();

        for (let i = 0; i < merakiDashboardClientsCount; i++) {
          const currentClientUser = merakiDashboardClientsData.data[i].description;
          this.allClientsName.push(currentClientUser);

          for (let j = 0; j < exposedClientByNameCount; j++) {
            const showClientsByName = (exposedClientByNameCount > 0) ? (currentClientUser == this.getClientByName[j].name) : false;

            if (showClientsByName) {
              const clientId = merakiDashboardClientsData.data[i].id;
              const clientUser = merakiDashboardClientsData.data[i].description;

              this.clientsId.push(clientId);
              this.clientsUser.push(clientUser);

              try {
                const dashboardClientsByIdPolicyUrl = this.host + '/api/v1/networks/' + this.networkId + '/clients/' + clientId + '/policy';
                const merakiDashboardClientPolicyData = await this.meraki.get(dashboardClientsByIdPolicyUrl);
                this.log.debug('Debug merakiDashboardClientPolicyData: %s', merakiDashboardClientPolicyData.data);

                const clientPolicyMac = merakiDashboardClientPolicyData.data.mac;
                const clientPolicyPolicy = merakiDashboardClientPolicyData.data.devicePolicy;
                const clientPolicyGroupPolicyId = merakiDashboardClientPolicyData.data.groupPolicyId;
                const clientPolicyState = (clientPolicyPolicy == 'Normal' || clientPolicyPolicy == 'Whitelisted');

                this.clientsPolicyMac.push(clientPolicyMac);
                this.clientsPolicyPolicy.push(clientPolicyPolicy);
                this.clientsPolicyGroupPolicyId.push(clientPolicyGroupPolicyId);
                this.clientsPolicyState.push(clientPolicyState);
              } catch (error) {
                this.log.error('Device: %s %s, merakiDashboardClientPolicyData error: %s', this.host, this.name, error);
              }
            }
          }
        }
        for (let j = 0; j < exposedClientByNameCount; j++) {
          if (this.merakiClientPolicyServices) {
            this.merakiClientPolicyServices[j]
              .updateCharacteristic(Characteristic.On, this.clientsPolicyState[j]);
          }
        }
      }


      //MR device
      if (merakiMrSsidsData.status == 200) {
        this.allSsidsName = new Array();
        this.ssidsName = new Array();
        this.ssidsState = new Array();

        this.hidenSsidsByName = new Array();
        for (let j = 0; j < hiddenSsidsCount; j++) {
          const hiddedSsidByName = this.hideSsidByName[j].name;
          this.hidenSsidsByName.push(hiddedSsidByName);
        }

        for (let i = 0; i < allSsidsCount; i++) {
          const currentSsidName = merakiMrSsidsData.data[i].name;
          this.allSsidsName.push(currentSsidName);

          const showConfiguredSsids = this.hideUnconfiguredSsids ? (currentSsidName.substr(0, 12) != 'Unconfigured') : true;
          if (showConfiguredSsids) {
            const ssidName = merakiMrSsidsData.data[i].name;
            const ssidState = (merakiMrSsidsData.data[i].enabled == true)

            const pushName = (this.hidenSsidsByName.indexOf(ssidName) >= 0) ? false : this.ssidsName.push(ssidName);
            const pushState = (this.hidenSsidsByName.indexOf(ssidName) >= 0) ? false : this.ssidsState.push(ssidState);
          }
        }

        const exposedSsidsCount = this.ssidsName.length;
        for (let i = 0; i < exposedSsidsCount; i++) {
          const ssidState = this.ssidsState[i];

          if (this.merakiSsidServices) {
            this.merakiSsidServices[i]
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
      this.log.error('Device: %s %s, update Device state error: %s', this.host, this.name, error);
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
    const merakiDashboardClientsCount = this.merakiDashboardClientsCount;
    const allSsidsCount = this.allSsidsCount;
    const hiddenSsidsCount = this.hiddenSsidsCount;
    const exposedClientByNameCount = this.exposedClientByNameCount;
    const exposedSsidsCount = this.exposedSsidsCount;

    this.merakiClientPolicyServices = new Array();
    for (let i = 0; i < exposedClientByNameCount; i++) {
      const clientName = this.clientsUser[i];
      const merakiClientPolicyService = new Service.Switch(clientName, 'merakiClientPolicyService' + i);
      merakiClientPolicyService.getCharacteristic(Characteristic.On)
        .onGet(async () => {
          const state = this.clientsPolicyState[i];
          if (!this.disableLogInfo) {
            this.log('Device: %s, client: %s, get policy, state: %s', accessoryName, clientName, this.clientsPolicyPolicy[i]);
          }
          return state;
        })
        .onSet(async (state) => {
          const policy = state ? 'Normal' : 'Blocked';
          const dashboardClientsByIdPolicyUrl = this.host + '/api/v1/networks/' + this.networkId + '/clients/' + this.clientsId[i] + '/policy';
          const setClientPolicy = this.meraki.put(dashboardClientsByIdPolicyUrl, {
            'devicePolicy': policy
          });
          this.log.debug('Device: %s %s, debug setClientPolicy: %s', this.host, this.name, setClientPolicy.data);
          if (!this.disableLogInfo) {
            this.log('Device: %s, client: %s, set policy, state: %s', accessoryName, clientName, policy);
          }
        });

      this.merakiClientPolicyServices.push(merakiClientPolicyService);
      accessory.addService(this.merakiClientPolicyServices[i]);
    }

    this.merakiSsidServices = new Array();
    for (let i = 0; i < exposedSsidsCount; i++) {
      const ssidName = this.ssidsName[i];
      const merakiSsidService = new Service.Switch(ssidName, 'merakiSsidService' + i);
      merakiSsidService.getCharacteristic(Characteristic.On)
        .onGet(async () => {
          const state = this.ssidsState[i];
          if (!this.disableLogInfo) {
            this.log('Device: %s, SSIDs: %s get state: %s', accessoryName, ssidName, state ? 'ON' : 'OFF');
          }
          return state;
        })
        .onSet(async (state) => {
          state = state ? true : false;
          let j = this.allSsidsName.indexOf(ssidName);
          const setSsid = this.meraki.put(this.mrSsidUrl + '/' + [j], {
            'enabled': state
          });
          this.log.debug('Device: %s %s, debug response: %s', this.host, this.name, setSsid.data);
          if (!this.disableLogInfo) {
            this.log('Device: %s, SSID: %s set state: %s', accessoryName, ssidName, state ? 'ON' : 'OFF');
          }
        });

      this.merakiSsidServices.push(merakiSsidService);
      accessory.addService(this.merakiSsidServices[i]);
    }

    this.startPrepareAccessory = false;
    this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
    this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
  }
}