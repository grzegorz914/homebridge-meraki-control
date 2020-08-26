'use strict';

const axios = require('axios');
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
    this.accessories = [];

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching');
      for (let i = 0, len = this.devices.length; i < len; i++) {
        let deviceName = this.devices[i];
        if (!deviceName.name) {
          this.log.warn('Device Name Missing');
        } else {
          this.accessories.push(new merakiDevice(this.log, deviceName, this.api));
        }
      }
    });
  }

  configureAccessory(accessory) {
    this.log.debug('configureAccessory');
    this.accessories.push(accessory);
  }

  removeAccessory(accessory) {
    this.log.debug('removeAccessory');
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
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
    this.deviceSerial = config.deviceSerial;
    this.wlanControl = config.wlanControl || 0;
    this.refreshInterval = config.refreshInterval || 10;

    //get Device info
    this.manufacturer = config.manufacturer || 'Meraki';
    this.modelName = config.modelName || 'Meraki MR';
    this.serialNumber = config.serialNumber || 'SN0000006';
    this.firmwareRevision = config.firmwareRevision || 'FW0000006';

    //setup variables
    this.checkDeviceInfo = false;
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
    this.msUrl = this.host + '/api/v1/devices/' + this.deviceSerial + '/switch/ports';
    this.mvUrl = this.host + '/api/v1/devices/' + this.deviceSerial + '/camera';

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
      }
    }.bind(this), this.refreshInterval * 1000);

    this.prepareMerakiService();
  }

  //Prepare service 
  prepareMerakiService() {
    this.log.debug('prepareMerakiService');
    const accessoryName = this.name;
    const accessoryUUID = UUID.generate(accessoryName);
    this.accessory = new Accessory(accessoryName, accessoryUUID);
    this.accessory.category = Categories.AIRPORT;

    this.accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.modelName)
      .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

    this.meraki.get(this.mrUrl).then(response => {
      this.log.debug('Device %s, get device status data: %s', this.name, response.data);
      let result = response.data;

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

    }).catch(error => {
      this.log.debug('Device: %s, read SSIDs error: %s', this.name, error);
    });

    this.log.debug('Device: %s, publishExternalAccessories.', accessoryName);
    this.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
  }

  updateDeviceState() {
    var me = this;
    me.meraki.get(me.mrUrl).then(response => {
      me.log.info('Device: %s, state: Online.', me.name);
      me.log.debug('Device %s, get device status data: %s', me.name, response.data);
      let result = response.data;

      let wlanLength = result.length;
      me.log.debug('Device: %s, number of available SSIDs: %s', me.name, wlanLength);
      me.wlanLength = wlanLength;

      if (me.wlanControl >= 1 && me.merakiService0) {
        let wlan0Name = result[0].name;
        let wlan0State = (result[0].enabled == true);
        me.merakiService0.updateCharacteristic(Characteristic.On, wlan0State);
        me.log.debug('Device: %s, SSIDs name: %s', me.host, wlan0Name);
        me.log.debug('Device: %s, ' + wlan0Name + ' state: %s', me.name, wlan0State ? 'ON' : 'OFF');
        me.wlan0Name = wlan0Name;
        me.wlan0State = wlan0State;
      }
      if (me.wlanControl >= 2 && me.merakiService1) {
        let wlan1Name = result[1].name;
        let wlan1State = (result[1].enabled == true);
        me.merakiService1.updateCharacteristic(Characteristic.On, wlan1State);
        me.log.debug('Device: %s, SSIDs name: %s', me.name, wlan1Name);
        me.log.debug('Device: %s, ' + wlan1Name + ' state: %s', me.name, wlan1State ? 'ON' : 'OFF');
        me.wlan1Name = wlan1ame;
        me.wlan1State = wlan1State;
      }
      if (me.wlanControl >= 3 && me.merakiService2) {
        let wlan2Name = result[2].name;
        let wlan2State = (result[2].enabled == true);
        me.merakiService2.updateCharacteristic(Characteristic.On, wlan2State);
        me.log.debug('Device: %s, SSIDs name: %s', me.name, wlan2Name);
        me.log.debug('Device: %s, ' + wlan2Name + ' state: %s', me.name, wlan2State ? 'ON' : 'OFF');
        me.wlan2Name = wlan2Name;
        me.wlan2State = wlan2State;
      }
      if (me.wlanControl >= 4 && me.merakiService3) {
        let wlan3Name = result[3].name;
        let wlan3State = (result[3].enabled == true);
        me.merakiService3.updateCharacteristic(Characteristic.On, wlan3State);
        me.log.debug('Device: %s, SSIDs name: %s', me.name, wlan3Name);
        me.log.debug('Device: %s, ' + wlan3Name + ' state: %s', me.name, wlan3State ? 'ON' : 'OFF');
        me.wlan4Name = wlan4Name;
        me.wlan3State = wlan3State;
      }
      if (me.wlanControl >= 5 && me.merakiService4) {
        let wlan4Name = result[4].name;
        let wlan4State = (result[4].enabled == true);
        me.merakiService4.updateCharacteristic(Characteristic.On, wlan4State);
        me.log.debug('Device: %s, SSIDs name: %s', me.name, wlan4Name);
        me.log.debug('Device: %s, ' + wlan4Name + ' state: %s', me.name, wlan4State ? 'ON' : 'OFF');
        me.wlan4Name = wlan4Name;
        me.wlan4State = wlan4State;
      }
    }).catch(error => {
      me.log.error('Device: %s, update Device state error: %s, state: Offline', me.name, error);
    });
  }

  getWlan0State(callback) {
    var me = this;
    me.meraki.get(me.mrUrl).then(response => {
      let state = (response.data[0].enabled == true);
      me.log.info('Device: %s %s, state: %s', me.name, me.wlan0Name, state ? 'ON' : 'OFF');
      callback(null, state);
    }).catch(error => {
      me.log.debug('Device: %s %s, get state error: %s', me.name, me.wlan0Name, error);
    });
  }

  setWlan0State(state, callback) {
    var me = this;
    let newState = state ? true : false;
    let data = { 'enabled': newState };
    me.meraki.put(me.mrUrl + '/0', data).then(response => {
      me.log.info('Device: %s %s, state: %s', me.name, me.wlan0Name, state ? 'ON' : 'OFF');
      me.getWlan0State();
    }).catch(error => {
      me.log('Device: %s %s, set new state error: %s', me.name, me.wlan0Name, error);
    });
    callback(null, state);
  }

  getWlan1State(callback) {
    var me = this;
    me.meraki.get(me.mrUrl).then(response => {
      let state = (response.data[1].enabled == true);
      me.log.info('Device: %s %s, state: %s', me.name, me.wlan1Name, state ? 'ON' : 'OFF');
      callback(null, state);
    }).catch(error => {
      me.log.debug('Device: %s %s, get state error: %s', me.name, me.wlan1Name, error);
    });
  }

  setWlan1State(state, callback) {
    var me = this;
    let newState = state ? true : false;
    let data = { 'enabled': newState };
    me.meraki.put(me.mrUrl + '/1', data).then(response => {
      me.log.info('Device: %s %s, set state: %s', me.name, me.wlan1Name, state ? 'ON' : 'OFF');
      me.getWlan1State();
    }).catch(error => {
      me.log('Device: %s %s, set new state error: %s', me.name, me.wlan1Name, error);
    });
    callback(null, state);
  }

  getWlan2State(callback) {
    var me = this;
    me.meraki.get(me.mrUrl).then(response => {
      let state = (response.data[2].enabled == true);
      me.log.info('Device: %s %s, state: %s', me.name, me.wlan2Name, state ? 'ON' : 'OFF');
      callback(null, state);
    }).catch(error => {
      me.log.debug('Device: %s %s, get state error: %s', me.name, me.wlan2Name, error);
    });
  }

  setWlan2State(state, callback) {
    var me = this;
    let newState = state ? true : false;
    let data = { 'enabled': newState };
    me.meraki.put(me.mrUrl + '/2', data).then(response => {
      me.log.info('Device: %s %s, set state: %s', me.name, me.wlan2Name, state ? 'ON' : 'OFF');
      me.getWlan2State();
    }).catch(error => {
      me.log('Device: %s %s, set new state error: %s', me.name, me.wlan2Name, error);
    });
    callback(null, state);
  }

  getWlan3State(callback) {
    var me = this;
    me.meraki.get(me.mrUrl).then(response => {
      let state = (response.data[3].enabled == true);
      me.log.info('Device: %s %s, state: %s', me.name, me.wlan3Name, state ? 'ON' : 'OFF');
      callback(null, state);
    }).catch(error => {
      me.log.debug('Device: %s %s, get state error: %s', me.name, me.wlan3Name, error);
    });
  }

  setWlan3State(state, callback) {
    var me = this;
    let newState = state ? true : false;
    let data = { 'enabled': newState };
    me.meraki.put(me.mrUrl + '/3', data).then(response => {
      me.log.info('Device: %s %s, set state: %s', me.name, me.wlan3Name, state ? 'ON' : 'OFF');
      me.getWlan3State();
    }).catch(error => {
      me.log('Device: %s %s, set new state error: %s', me.name, me.wlan3Name, error);
    });
    callback(null, state);
  }

  getWlan4State(callback) {
    var me = this;
    me.meraki.get(me.mrUrl).then(response => {
      let state = (response.data[4].enabled == true);
      me.log.info('Device: %s %s, state: %s', me.name, me.wlan4Name, state ? 'ON' : 'OFF');
      callback(null, state);
    }).catch(error => {
      me.log.debug('Device: %s %s, get state error: %s', me.name, me.wlan4Name, error);
    });
  }

  setWlan4State(state, callback) {
    var me = this;
    let newState = state ? true : false;
    let data = { 'enabled': newState };
    me.meraki.put(me.mrUrl + '/4', data).then(response => {
      me.log.info('Device: %s %s, set state: %s', me.name, me.wlan4Name, state ? 'ON' : 'OFF');
      me.getWlan4State();
    }).catch(error => {
      me.log('Device: %s %s, set new state error: %s', me.name, me.wlan4Name, error);
    });
    callback(null, state);
  }
}

