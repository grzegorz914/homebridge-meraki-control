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
    this.wlanControl = config.wlanControl || 0;
    this.refreshInterval = config.refreshInterval || 10;

    //get Device info
    this.manufacturer = config.manufacturer || 'Cisco/Meraki';
    this.modelName = config.modelName || 'Model Name';
    this.serialNumber = config.serialNumber || 'Serial Number';
    this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

    //setup variables
    this.checkDeviceState = false;
    this.wlanLength = 0;
    this.wlan0State = false;
    this.wlan1State = false;
    this.wlan2State = false;
    this.wlan3State = false;
    this.wlan4State = false;
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
      if (this.checkDeviceState) {
        this.updateDeviceState();
      }
    }.bind(this), this.refreshInterval * 1000);

    this.prepareAccessory();
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
  async prepareMerakiService() {
    this.log.debug('prepareMerakiService');
    try {
      const response = await this.meraki.get(this.mrUrl);
      let result = response.data;
      this.log.debug('Device %s, get device status data: %s', this.name, result);

      if (this.wlanControl >= 1) {
        this.wlan0Name = result[0].name;
        this.merakiService0 = new Service.Switch(this.wlan0Name, 'merakiService0');

        this.merakiService0.getCharacteristic(Characteristic.On)
          .on('get', this.getWlan0State.bind(this))
          .on('set', this.setWlan0State.bind(this));
        this.accessory.addService(this.merakiService0);
      }

      if (this.wlanControl >= 2) {
        this.wlan1Name = result[1].name;
        this.merakiService1 = new Service.Switch(this.wlan1Name, 'merakiService1');

        this.merakiService1.getCharacteristic(Characteristic.On)
          .on('get', this.getWlan1State.bind(this))
          .on('set', this.setWlan1State.bind(this));
        this.accessory.addService(this.merakiService1);
      }

      if (this.wlanControl >= 3) {
        this.wlan2Name = result[2].name;
        this.merakiService2 = new Service.Switch(this.wlan2Name, 'merakiService2');

        this.merakiService2.getCharacteristic(Characteristic.On)
          .on('get', this.getWlan2State.bind(this))
          .on('set', this.setWlan2State.bind(this));
        this.accessory.addService(this.merakiService2);
      }

      if (this.wlanControl >= 4) {
        this.wlan3Name = result[3].name;
        this.merakiService3 = new Service.Switch(this.wlan3Name, 'merakiService3');

        this.merakiService3.getCharacteristic(Characteristic.On)
          .on('get', this.getWlan3State.bind(this))
          .on('set', this.setWlan3State.bind(this));
        this.accessory.addService(this.merakiService3);
      }

      if (this.wlanControl >= 5) {
        this.wlan4Name = result[4].name;
        this.merakiService4 = new Service.Switch(this.wlan4Name, 'merakiService4');

        this.merakiService4.getCharacteristic(Characteristic.On)
          .on('get', this.getWlan4State.bind(this))
          .on('set', this.setWlan4State.bind(this));
        this.accessory.addService(this.merakiService4);
      }

      this.checkDeviceState = true;

    } catch (error) {
      this.log.debug('Device: %s, state Offline, read SSIDs error: %s', this.name, error);
    };
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
      me.updateDeviceState();
    } catch (error) {
      me.log.error('Device: %s, getDeviceInfo error: %s', me.name, error);
    }
  }

  async updateDeviceState() {
    var me = this;
    try {
      const response = await me.meraki.get(me.mrUrl);
      me.log.debug('Device %s, get device status data: %s', me.name, response.data);

      let wlanLength = response.data.length;
      me.log.debug('Device: %s, number of available SSIDs: %s', me.name, wlanLength);
      me.wlanLength = wlanLength;

      if (me.wlanControl >= 1 && me.merakiService0) {
        let wlan0Name = response.data[0].name;
        let wlan0State = (response.data[0].enabled == true);
        me.merakiService0.updateCharacteristic(Characteristic.On, wlan0State);
        me.log.debug('Device: %s, SSIDs: %s state: %s', me.name, wlan0Name, wlan0State ? 'ON' : 'OFF');
        me.wlan0Name = wlan0Name;
        me.wlan0State = wlan0State;
      }
      if (me.wlanControl >= 2 && me.merakiService1) {
        let wlan1Name = response.data[1].name;
        let wlan1State = (response.data[1].enabled == true);
        me.merakiService1.updateCharacteristic(Characteristic.On, wlan1State);
        me.log.debug('Device: %s, SSIDs: %s state: %s', me.name, wlan1Name, wlan1State ? 'ON' : 'OFF');
        me.wlan1Name = wlan1Name;
        me.wlan1State = wlan1State;
      }
      if (me.wlanControl >= 3 && me.merakiService2) {
        let wlan2Name = response.data[2].name;
        let wlan2State = (response.data[2].enabled == true);
        me.merakiService2.updateCharacteristic(Characteristic.On, wlan2State);
        me.log.debug('Device: %s, SSIDs: %s state: %s', me.name, wlan2Name, wlan2State ? 'ON' : 'OFF');
        me.wlan2Name = wlan2Name;
        me.wlan2State = wlan2State;
      }
      if (me.wlanControl >= 4 && me.merakiService3) {
        let wlan3Name = response.data[3].name;
        let wlan3State = (response.data[3].enabled == true);
        me.merakiService3.updateCharacteristic(Characteristic.On, wlan3State);
        me.log.debug('Device: %s, SSIDs: %s state: %s', me.name, wlan3Name, wlan3State ? 'ON' : 'OFF');
        me.wlan3Name = wlan3Name;
        me.wlan3State = wlan3State;
      }
      if (me.wlanControl >= 5 && me.merakiService4) {
        let wlan4Name = response.data[4].name;
        let wlan4State = (response.data[4].enabled == true);
        me.merakiService4.updateCharacteristic(Characteristic.On, wlan4State);
        me.log.debug('Device: %s, SSIDs: %s state: %s', me.name, wlan4Name, wlan4State ? 'ON' : 'OFF');
        me.wlan4Name = wlan4Name;
        me.wlan4State = wlan4State;
      }
    } catch (error) {
      me.log.error('Device: %s, update status error: %s, state: Offline', me.name, error);
    }
  }

  async getWlan0State(callback) {
    var me = this;
    try {
      const response = await me.meraki.get(me.mrUrl);
      let state = (response.data[0].enabled == true);
      me.log.info('Device: %s, SSIDs: %s state: %s', me.name, me.wlan0Name, state ? 'ON' : 'OFF');
      callback(null, state);
    } catch (error) {
      me.log.debug('Device: %s, SSIDs: %s get state error: %s', me.name, me.wlan0Name, error);
    };
  }

  async setWlan0State(state, callback) {
    var me = this;
    let newState = state ? true : false;
    let data = { 'enabled': newState };
    try {
      const response = await me.meraki.put(me.mrUrl + '/0', data);
      me.log.info('Device: %s, SSIDs: %s state: %s', me.name, me.wlan0Name, state ? 'ON' : 'OFF');
      callback(null, state);
    } catch (error) {
      me.log('Device: %s, SSIDs: %s set new state error: %s', me.name, me.wlan0Name, error);
    };
  }

  async getWlan1State(callback) {
    var me = this;
    try {
      const response = await me.meraki.get(me.mrUrl);
      let state = (response.data[1].enabled == true);
      me.log.info('Device: %s, SSIDs: %s state: %s', me.name, me.wlan1Name, state ? 'ON' : 'OFF');
      callback(null, state);
    } catch (error) {
      me.log.debug('Device: %s, SSIDs: %s get state error: %s', me.name, me.wlan1Name, error);
    };
  }

  async setWlan1State(state, callback) {
    var me = this;
    let newState = state ? true : false;
    let data = { 'enabled': newState };
    try {
      const response = await me.meraki.put(me.mrUrl + '/1', data);
      me.log.info('Device: %s, SSIDs: %s set state: %s', me.name, me.wlan1Name, state ? 'ON' : 'OFF');
      callback(null, state);
    } catch (error) {
      me.log('Device: %s, SSIDs: %s set new state error: %s', me.name, me.wlan1Name, error);
    };
  }

  async getWlan2State(callback) {
    var me = this;
    try {
      const response = await me.meraki.get(me.mrUrl);
      let state = (response.data[2].enabled == true);
      me.log.info('Device: %s, SSIDs: %s state: %s', me.name, me.wlan2Name, state ? 'ON' : 'OFF');
      callback(null, state);
    } catch (error) {
      me.log.debug('Device: %s, SSIDs: %s get state error: %s', me.name, me.wlan2Name, error);
    };
  }

  async setWlan2State(state, callback) {
    var me = this;
    let newState = state ? true : false;
    let data = { 'enabled': newState };
    try {
      const response = await me.meraki.put(me.mrUrl + '/2', data);
      me.log.info('Device: %s, SSIDs: %s set state: %s', me.name, me.wlan2Name, state ? 'ON' : 'OFF');
      callback(null, state);
    } catch (error) {
      me.log('Device: %s, SSIDs: %s set new state error: %s', me.name, me.wlan2Name, error);
    };
  }

  async getWlan3State(callback) {
    var me = this;
    try {
      const response = await me.meraki.get(me.mrUrl);
      let state = (response.data[3].enabled == true);
      me.log.info('Device: %s, SSIDs: %s state: %s', me.name, me.wlan3Name, state ? 'ON' : 'OFF');
      callback(null, state);
    } catch (error) {
      me.log.debug('Device: %s, SSIDs: %s get state error: %s', me.name, me.wlan3Name, error);
    };
  }

  async setWlan3State(state, callback) {
    var me = this;
    let newState = state ? true : false;
    let data = { 'enabled': newState };
    try {
      const response = await me.meraki.put(me.mrUrl + '/3', data);
      me.log.info('Device: %s, SSIDs: %s set state: %s', me.name, me.wlan3Name, state ? 'ON' : 'OFF');
      callback(null, state);
    } catch (error) {
      me.log('Device: %s, SSIDs: %s set new state error: %s', me.name, me.wlan3Name, error);
    };
  }

  async getWlan4State(callback) {
    var me = this;
    try {
      const response = await me.meraki.get(me.mrUrl);
      let state = (response.data[4].enabled == true);
      me.log.info('Device: %s, SSIDs: %s state: %s', me.name, me.wlan4Name, state ? 'ON' : 'OFF');
      callback(null, state);
    } catch (error) {
      me.log.debug('Device: %s, SSIDs: %s get state error: %s', me.name, me.wlan4Name, error);
    };
  }

  async setWlan4State(state, callback) {
    var me = this;
    let newState = state ? true : false;
    let data = { 'enabled': newState };
    try {
      const response = await me.meraki.put(me.mrUrl + '/4', data);
      me.log.info('Device: %s, SSIDs: %s set state: %s', me.name, me.wlan4Name, state ? 'ON' : 'OFF');
      callback(null, state);
    } catch (error) {
      me.log('Device:%s, SSIDs: %s set new state error: %s', me.name, me.wlan4Name, error);
    };
  }
}