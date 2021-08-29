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
    this.dashboardClientsData = {
      'status': 0
    };
    this.ssidsData = {
      'status': 0
    };

    //meraki dashboard
    this.dashboardClientsCount = 0;
    this.exposedClientByNameCount = this.getClientByNameOrMac.length;

    //meraki mr
    this.ssidsCount = 0;
    this.exposedSsidsCount = 0;
    this.hiddenSsidsCount = this.hideSsidByName.length;


    //meraki url
    this.dashboardClientsUrl = this.host + '/api/v1/networks/' + this.networkId + '/clients?perPage=255&timespan=1209600';
    this.mxUrl = this.host + '/api/v1/networks/' + this.networkId + '/appliance/ports';
    this.ssidsUrl = this.host + '/api/v1/networks/' + this.networkId + '/wireless/ssids';
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

    //preferences directory
    this.prefDir = path.join(api.user.storagePath(), 'meraki');

    //check if prefs directory exist
    if (fs.existsSync(this.prefDir) == false) {
      fsPromises.mkdir(this.prefDir);
    }

    //Check device state
    setInterval(function () {
      if (this.checkDeviceInfo || this.checkDeviceState) {
        this.updateDashboardClientsData();
      }
    }.bind(this), this.refreshInterval * 1000);

    this.updateDashboardClientsData();
  }

  async updateDashboardClientsData() {
    this.log.debug('Device: %s %s, requesting dashboardClientsData.', this.host, this.name);
    try {
      const dashboardClientsData = await this.meraki.get(this.dashboardClientsUrl);
      this.log.debug('Debug dashboardClientsData: %s', dashboardClientsData.data[0]);
      const dashboardClientsCount = dashboardClientsData.data.length;

      this.dashboardClientsData = dashboardClientsData;
      this.dashboardClientsCount = dashboardClientsCount;

      this.updateSsidsData();
    } catch (error) {
      this.log.error('Device: %s %s, dashboardClientsData error: %s', this.host, this.name, error);
      this.checkDeviceState = false;
      this.checkDeviceInfo = true;
    };
  }

  async updateSsidsData() {
    this.log.debug('Device: %s %s, requesting ssidsData.', this.host, this.name);
    try {
      const ssidsData = await this.meraki.get(this.ssidsUrl);
      this.log.debug('Debug merakiMrData: %s', ssidsData.data[0]);
      const ssidsCount = ssidsData.data.length;

      this.ssidsData = ssidsData;
      this.ssidsCount = ssidsCount;

      const getDeviceInfo = !this.checkDeviceState ? this.getDeviceInfo() : this.updateDeviceState();
    } catch (error) {
      this.log.error('Device: %s %s, ssidsData error: %s', this.host, this.name, error);
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
      const dashboardClientsData = this.dashboardClientsData;
      const ssidsData = this.ssidsData;

      //get devices data variables
      const dashboardClientsCount = this.dashboardClientsCount;
      const exposedClientByNameCount = this.exposedClientByNameCount;
      const ssidsCount = this.ssidsCount;
      const hiddenSsidsCount = this.hiddenSsidsCount;


      //daschboards clients
      if (dashboardClientsData.status == 200) {
        this.clientsId = new Array();
        this.clientsUser = new Array();
        this.clientsMac = new Array();

        this.clientsPolicyMac = new Array();
        this.clientsPolicyPolicy = new Array();
        this.clientsPolicyGroupPolicyId = new Array();
        this.clientsPolicyState = new Array();

        const dashboardClientsDescription = new Array();
        const dashboardClientsMac = new Array();
        for (let i = 0; i < dashboardClientsCount; i++) {
          const clientDescription = dashboardClientsData.data[i].description;
          const clientMac = dashboardClientsData.data[i].mac;
          dashboardClientsDescription.push(clientDescription);
          dashboardClientsMac.push(clientMac);

          for (let j = 0; j < exposedClientByNameCount; j++) {
            const clientMode = this.getClientByNameOrMac[j].mode;
            const clientNameOrMac = this.getClientByNameOrMac[j].name;
            const clientsByNameOrMac = clientMode ? dashboardClientsMac : dashboardClientsDescription;
            const getClient = (clientsByNameOrMac.indexOf(clientNameOrMac) >= 0);

            if (getClient) {
              const clientId = dashboardClientsData.data[i].id;
              const clientUser = dashboardClientsData.data[i].description;
              const clientMac = dashboardClientsData.data[i].mac;

              try {
                const dashboardClientsPolicyUrl = this.host + '/api/v1/networks/' + this.networkId + '/clients/' + clientId + '/policy';
                const dashboardClientsPolicyData = await this.meraki.get(dashboardClientsPolicyUrl);
                this.log.debug('Debug dashboardClientsPolicyData: %s', dashboardClientsPolicyData.data);

                const clientPolicyMac = dashboardClientsPolicyData.data.mac;
                const clientPolicyPolicy = dashboardClientsPolicyData.data.devicePolicy;
                const clientPolicyGroupPolicyId = dashboardClientsPolicyData.data.groupPolicyId;
                const clientPolicyState = (clientPolicyPolicy == 'Normal' || clientPolicyPolicy == 'Whitelisted');

                if (this.merakiClientPolicyServices) {
                  this.merakiClientPolicyServices[j]
                    .updateCharacteristic(Characteristic.On, clientPolicyState);
                }

                this.clientsPolicyMac.push(clientPolicyMac);
                this.clientsPolicyPolicy.push(clientPolicyPolicy);
                this.clientsPolicyGroupPolicyId.push(clientPolicyGroupPolicyId);
                this.clientsPolicyState.push(clientPolicyState);
              } catch (error) {
                this.log.error('Device: %s %s, dashboardClientsPolicyData error: %s', this.host, this.name, error);
              }
              this.clientsId.push(clientId);
              this.clientsUser.push(clientUser);
              this.clientsMac.push(clientMac);
            }
          }
        }
      }


      //SSIDs
      if (ssidsData.status == 200) {
        this.ssidsName = new Array();
        this.exposedSsidsName = new Array();
        this.exposedSsidsState = new Array();
        this.hidenSsidsName = new Array();

        for (let j = 0; j < hiddenSsidsCount; j++) {
          const hiddedSsidByName = this.hideSsidByName[j].name;
          this.hidenSsidsName.push(hiddedSsidByName);
        }

        for (let i = 0; i < ssidsCount; i++) {
          const ssidName = ssidsData.data[i].name;
          this.ssidsName.push(ssidName);

          const showConfiguredSsids = this.hideUnconfiguredSsids ? (ssidName.substr(0, 12) != 'Unconfigured') : true;
          if (showConfiguredSsids) {
            const ssidName = ssidsData.data[i].name;
            const ssidState = (ssidsData.data[i].enabled == true)

            const pushName = (this.hidenSsidsName.indexOf(ssidName) >= 0) ? false : this.exposedSsidsName.push(ssidName);
            const pushState = (this.hidenSsidsName.indexOf(ssidName) >= 0) ? false : this.exposedSsidsState.push(ssidState);
          }
        }

        const exposedSsidsCount = this.exposedSsidsName.length;
        for (let i = 0; i < exposedSsidsCount; i++) {
          const ssidState = this.exposedSsidsState[i];

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
    const dashboardClientsCount = this.dashboardClientsCount;
    const ssidsCount = this.ssidsCount;
    const hiddenSsidsCount = this.hiddenSsidsCount;
    const exposedClientByNameCount = this.exposedClientByNameCount;
    const exposedSsidsCount = this.exposedSsidsCount;

    this.merakiClientPolicyServices = new Array();
    for (let i = 0; i < exposedClientByNameCount; i++) {
      const clientName = this.clientsUser[i];
      const clientCustomName = this.getClientByNameOrMac[i].customName;
      const clientNameToBeExposed = clientCustomName.length > 0 ? clientCustomName : clientName;
      const merakiClientPolicyService = new Service.Switch(clientNameToBeExposed, 'merakiClientPolicyService' + i);
      merakiClientPolicyService.getCharacteristic(Characteristic.On)
        .onGet(async () => {
          const state = this.clientsPolicyState[i];
          if (!this.disableLogInfo) {
            this.log('Device: %s, client: %s, get policy, state: %s', accessoryName, clientNameToBeExposed, this.clientsPolicyPolicy[i]);
          }
          return state;
        })
        .onSet(async (state) => {
          const policy = state ? 'Normal' : 'Blocked';
          const dashboardClientsPolicyUrl = this.host + '/api/v1/networks/' + this.networkId + '/clients/' + this.clientsId[i] + '/policy';
          const setClientPolicy = this.meraki.put(dashboardClientsPolicyUrl, {
            'devicePolicy': policy
          });
          this.log.debug('Device: %s %s, debug setClientPolicy: %s', accessoryName, setClientPolicy.data);
          if (!this.disableLogInfo) {
            this.log('Device: %s, client: %s, set policy, state: %s', accessoryName, clientNameToBeExposed, policy);
          }
        });

      this.merakiClientPolicyServices.push(merakiClientPolicyService);
      accessory.addService(this.merakiClientPolicyServices[i]);
    }

    this.merakiSsidServices = new Array();
    for (let i = 0; i < exposedSsidsCount; i++) {
      const ssidName = this.exposedSsidsName[i];
      const merakiSsidService = new Service.Switch(ssidName, 'merakiSsidService' + i);
      merakiSsidService.getCharacteristic(Characteristic.On)
        .onGet(async () => {
          const state = this.exposedSsidsState[i];
          if (!this.disableLogInfo) {
            this.log('Device: %s, SSIDs: %s, get state: %s', accessoryName, ssidName, state ? 'ON' : 'OFF');
          }
          return state;
        })
        .onSet(async (state) => {
          state = state ? true : false;
          let j = this.ssidsName.indexOf(ssidName);
          const setSsid = this.meraki.put(this.ssidsUrl + '/' + [j], {
            'enabled': state
          });
          this.log.debug('Device: %s %s, debug setSsid: %s', accessoryName, setSsid.data);
          if (!this.disableLogInfo) {
            this.log('Device: %s, SSID: %s, set state: %s', accessoryName, ssidName, state ? 'ON' : 'OFF');
          }
        });

      this.merakiSsidServices.push(merakiSsidService);
      accessory.addService(this.merakiSsidServices[i]);
    }

    this.startPrepareAccessory = false;
    this.log.debug('Device: %s, publishExternalAccessories.', accessoryName);
    this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
  }
}