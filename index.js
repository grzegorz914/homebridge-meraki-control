'use strict';

const axios = require('axios').default;
const fs = require('fs');
const path = require('path');

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

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching');
      for (let i = 0, len = this.devices.length; i < len; i++) {
        let deviceName = this.devices[i];
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
    this.refreshInterval = config.refreshInterval || 10;

    //get Device info
    this.manufacturer = config.manufacturer || 'Cisco/Meraki';
    this.modelName = config.modelName || 'Model Name';
    this.serialNumber = config.serialNumber || 'Serial Number';
    this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

    //setup variables
    this.checkDeviceInfo = false;
    this.checkDeviceState = false;
    this.merakiDataOK = false;
    this.wlanLength = 0;
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
    if (this.prefDir.endsWith('/') === false) {
      this.prefDir = this.prefDir + '/';
    }

    //check if the directory exists, if not then create it
    if (fs.existsSync(this.prefDir) === false) {
      fs.mkdir(this.prefDir, { recursive: false }, (error) => {
        if (error) {
          this.log.error('Device: %s , create directory: %s, error: %s', this.name, this.prefDir, error);
        } else {
          this.log.debug('Device: %s , create directory successful: %s', this.name, this.prefDir);
        }
      });
    }

    //Check device state
    setInterval(function () {
      if (this.checkDeviceInfo) {
        this.getDeviceInfo();
      } else if (!this.checkDeviceInfo && this.checkDeviceState) {
        this.updateDeviceState();
      }
    }.bind(this), this.refreshInterval * 1000);

    this.getDeviceInfo()
  }

  async getDeviceInfo() {
    var me = this;
    try {
      me.log.info('Device: %s, state: Online.', me.name);
      me.log('-------- %s --------', me.name);
      me.log('Manufacturer: %s', me.manufacturer);
      me.log('Model: %s', me.modelName);
      me.log('Serialnr: %s', me.serialNumber);
      me.log('Firmware: %s', me.firmwareRevision);
      me.log('----------------------------------');

      me.checkDeviceInfo = false;
      me.updateDeviceState();
    } catch (error) {
      me.log.error('Device: %s, getDeviceInfo error: %s', me.name, error);
      me.checkDeviceInfo = true;
    }
  }

  async updateDeviceState() {
    var me = this;
    try {
      me.wlanState = new Array();
      me.wlanName = new Array();

      const response = await me.meraki.get(me.mrUrl);
      me.log.debug('Device %s, get device status data: %s', me.name, response.data);
      let wlanLength = response.data.length;
      me.log.debug('Device: %s, number of available SSIDs: %s', me.name, wlanLength);
      me.wlanLength = wlanLength;

      for (let i = 0; i < wlanLength; i++) {
        if (response.status == 200) {
          let wlanName = response.data[i].name;
          let wlanState = response.data[i].enabled;
          if (me.merakiService) {
            me.merakiService.updateCharacteristic(Characteristic.On, wlanState);
            me.log.debug('Device: %s, SSIDs: %s state: %s', me.name, wlanName, wlanState ? 'ON' : 'OFF');
          }
          me.wlanName.push(wlanName);
          me.wlanState.push(wlanState);
          me.merakiDataOK = true;
        }
      }
      if (!me.checkDeviceState) {
        me.prepareAccessory();
      }
      me.checkDeviceState = true;
    } catch (error) {
      me.log.error('Device: %s, update status error: %s, state: Offline', me.name, error);
      me.checkDeviceState = false;
      me.checkDeviceInfo = true;
    }
  }

  //Prepare accessory
  prepareAccessory() {
    this.log.debug('prepareAccessory');
    const accessoryName = this.name;
    const accessoryUUID = UUID.generate(accessoryName);
    const accessoryCategory = Categories.AIRPORT;
    this.accessory = new Accessory(accessoryName, accessoryUUID, accessoryCategory);

    this.prepareInformationService();
    this.prepareMerakiService();

    this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
    this.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
  }

  //Prepare information service
  prepareInformationService() {
    this.log.debug('prepareInformationService');
    this.getDeviceInfo();

    let manufacturer = this.manufacturer;
    let modelName = this.modelName;
    let serialNumber = this.serialNumber;
    let firmwareRevision = this.firmwareRevision;

    this.accessory.removeService(this.accessory.getService(Service.AccessoryInformation));
    const informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, manufacturer)
      .setCharacteristic(Characteristic.Model, modelName)
      .setCharacteristic(Characteristic.SerialNumber, serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, firmwareRevision);

    this.accessory.addService(informationService);
  }

  //Prepare service 
  prepareMerakiService() {
    this.log.debug('prepareMerakiService');
    if (this.wlanLength > 0 && this.merakiDataOK) {
      for (let i = 0; i < this.wlanLength; i++) {
        this.merakiService = new Service.Switch(this.wlanName[i], 'merakiService' + i);
        this.merakiService.getCharacteristic(Characteristic.On)
          .on('get', (callback) => {
            let value = this.wlanState[i];
            this.log.info('Device: %s, SSIDs: %s state: %s', this.name, this.wlanName[i], value ? 'ON' : 'OFF');
            callback(null, value);
          })
          .on('set', (value, callback) => {
            let data = { 'enabled': value };
            const response = this.meraki.put(this.mrUrl + '/' + [i], data);
            this.log.info('Device: %s, SSIDs: %s state: %s', this.name, this.wlanName[i], value ? 'ON' : 'OFF');
            callback(null);
          });
        this.accessory.addService(this.merakiService);
      }
    }
  }
}