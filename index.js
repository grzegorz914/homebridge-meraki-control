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
    this.filterSsidByName = config.filterSsidByName || [];

    //get Device info
    this.manufacturer = config.manufacturer || 'Cisco/Meraki';
    this.modelName = config.modelName || 'Model Name';
    this.serialNumber = config.serialNumber || 'Serial Number';
    this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

    //setup variables
    this.merakiMrData = {
      'status': 0
    };
    this.checkDeviceInfo = false;
    this.checkDeviceState = false;
    this.startPrepareAccessory = true;
    this.wlanCount = 0;
    this.showNotFilteredSsid = true;
    this.filteredSsidCount = 0;

    this.prefDir = path.join(api.user.storagePath(), 'meraki');
    this.mxUrl = this.host + '/api/v1/networks/' + this.networkId + '/appliance/ports';
    this.mrUrl = this.host + '/api/v1/networks/' + this.networkId + '/wireless/ssids';
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
    if (this.prefDir.endsWith('/') == false) {
      this.prefDir = this.prefDir + '/';
    }
    //check if the directory exists, if not then create it
    if (fs.existsSync(this.prefDir) == false) {
      fsPromises.mkdir(this.prefDir);
    }

    //Check device state
    setInterval(function () {
      if (this.checkDeviceInfo || this.checkDeviceState) {
        this.updateMerakiMrData();
      }
    }.bind(this), this.refreshInterval * 1000);

    this.updateMerakiMrData();
  }

  async updateMerakiMrData() {
    this.log.debug('Device: %s %s, requesting merakiMrData.', this.host, this.name);
    try {
      const merakiMrData = await this.meraki.get(this.mrUrl);
      this.log.debug('Debug merakiMrData: %s', merakiMrData.data);
      this.merakiMrData = merakiMrData;

      const getDeviceInfo = !this.checkDeviceState ? this.getDeviceInfo() : this.updateDeviceState();
    } catch (error) {
      this.log.error('Device: %s %s, merakiMrData error: %s', this.host, this.name, error);
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
      const merakiMrData = this.merakiMrData;

      //MR device
      if (merakiMrData.status == 200) {
        this.allWlanName = new Array();
        this.wlanName = new Array();
        this.wlanState = new Array();

        const allWlanCount = merakiMrData.data.length;
        const filteredSsidCount = this.filterSsidByName.length;

        for (let j = 0; j < allWlanCount; j++) {
          const currentWlanName = merakiMrData.data[j].name;
          this.allWlanName.push(currentWlanName);

          for (let i = 0; i < filteredSsidCount; i++) {
            this.showNotFilteredSsid = filteredSsidCount > 0 ? (currentWlanName != this.filterSsidByName[i].name) : true;
          }

          const showConfiguredSsids = this.hideUnconfiguredSsids ? (currentWlanName.substr(0, 12) != 'Unconfigured') : true;
          if (showConfiguredSsids && this.showNotFilteredSsid) {
            const wlanName = merakiMrData.data[j].name;
            const wlanState = (merakiMrData.data[j].enabled == true);

            this.wlanName.push(wlanName);
            this.wlanState.push(wlanState);
          }
        }

        const wlanCount = this.wlanName.length;
        for (let i = 0; i < wlanCount; i++) {
          const wlanState = this.wlanState[i];

          if (this.merakiServices) {
            this.merakiServices[i]
              .updateCharacteristic(Characteristic.On, wlanState);
          }
        }

        this.wlanCount = wlanCount;
        this.filteredSsidCount = filteredSsidCount;
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

    this.merakiServices = new Array();
    const wlanCount = this.wlanCount;
    for (let i = 0; i < wlanCount; i++) {
      const wlanName = this.wlanName[i];
      const merakiService = new Service.Switch(wlanName, 'merakiService' + i);
      merakiService.getCharacteristic(Characteristic.On)
        .onGet(async () => {
          const state = this.wlanState[i];
          if (!this.disableLogInfo) {
            this.log('Device: %s, SSIDs: %s get state: %s', accessoryName, wlanName, state ? 'ON' : 'OFF');
          }
          return state;
        })
        .onSet(async (state) => {
          state = state ? true : false;
          let j = this.allWlanName.indexOf(wlanName);
          const response = this.meraki.put(this.mrUrl + '/' + [j], {
            'enabled': state
          });
          this.log.debug('Device: %s %s, debug response: %s', this.host, this.name, response);
          if (!this.disableLogInfo) {
            this.log('Device: %s, SSIDs: %s set state: %s', accessoryName, wlanName, state ? 'ON' : 'OFF');
          }
        });

      this.merakiServices.push(merakiService);
      accessory.addService(this.merakiServices[i]);
    }

    this.startPrepareAccessory = false;
    this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
    this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
  }
}