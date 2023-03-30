'use strict';
const path = require('path');
const fs = require('fs');
const MerakiDb = require('./src/merakidb.js');
const MerakiMr = require('./src/merakimr.js');
const MerakiMs = require('./src/merakims.js');
const CONSTANS = require('./src/constans.json');
let Accessory, Characteristic, Service, Categories, UUID;

module.exports = (api) => {
  Accessory = api.platformAccessory;
  Characteristic = api.hap.Characteristic;
  Service = api.hap.Service;
  Categories = api.hap.Categories;
  UUID = api.hap.uuid;
  api.registerPlatform(CONSTANS.PluginName, CONSTANS.PlatformName, merakiPlatform, true);
}

class merakiPlatform {
  constructor(log, config, api) {
    // only load if configured
    if (!config || !Array.isArray(config.devices)) {
      log(`No configuration found for ${CONSTANS.PluginName}`);
      return;
    }
    this.log = log;
    this.api = api;
    this.accessories = [];

    api.on('didFinishLaunching', () => {
      log.debug('didFinishLaunching');
      for (const device of config.devices) {
        if (!device.name || !device.apiKey || !device.organizationId || !device.networkId) {
          log.warn('Device name, api key, organization Id or network Id missing');
          return
        }
        new merakiDevice(log, device, api);
      }
    });
  }

  configureAccessory(accessory) {
    this.log.debug('configurePlatformAccessory');
    this.accessories.push(accessory);
  }
}

class merakiDevice {
  constructor(log, config, api) {
    this.log = log;
    this.api = api;

    //network configuration
    this.host = config.host;
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.organizationId = config.organizationId;
    this.networkId = config.networkId;
    this.dashboardClientsControl = config.dashboardClientsControl || false;
    this.dashboardClientsSensor = config.enableSonsorClients || false;
    this.dashboardClientsPolicy = config.dashboardClientsPolicy || [];
    this.accessPointsControl = config.accessPointsControl || false;
    this.accessPointsHideUnconfiguredSsids = config.hideUnconfiguredSsids || false;
    this.accessPointsHideSsidsByName = config.hideSsids || [];
    this.accessPointsSsidsSensor = config.enableSonsorSsids || false;
    this.switchesControl = config.switchesControl || false;
    this.switches = config.switches || [];
    this.refreshInterval = config.refreshInterval || 5;
    this.enableDebugMode = config.enableDebugMode || false;
    this.disableLogInfo = config.disableLogInfo || false;
    this.disableLogDeviceInfo = config.disableLogDeviceInfo || false;

    //meraki url
    this.organizationsIdUrl = `/organizations`;
    this.networksIdUrl = `/organizations/${this.organizationId}/networks`;
    this.networkUrl = `/networks/${this.networkId}`;
    this.devicesUrl = `/organizations/${this.organizationId}/devices`;
    this.dashboardClientsUrl = `/networks/${this.networkId}/clients`;
    this.mrlianceUrl = `/networks/${this.networkId}/appliance/ports`;
    this.wirelessUrl = `/networks/${this.networkId}/wireless/ssids`;

    //setup variables
    this.checkDeviceInfo = true;
    this.startPrepareAccessory = true;
    this.dbClientsCount = 0;
    this.mrSsidsCount = 0;
    this.msPortsCount = 0;

    //preferences directory
    const prefDir = path.join(api.user.storagePath(), 'meraki');

    //check if prefs directory exist
    if (!fs.existsSync(prefDir)) {
      fs.mkdirSync(prefDir);
    };
    this.getDeviceInfo();

    //meraki dashboard
    if (this.dashboardClientsControl) {
      this.merakiDb = new MerakiDb({
        host: this.host,
        apiKey: this.apiKey,
        networkId: this.networkId,
        clientsPolicy: this.dashboardClientsPolicy,
        debugLog: this.enableDebugMode,
        refreshInterval: this.refreshInterval,
      });

      this.merakiDb.on('data', (confClientsPolicyName, confClientsPolicyType, clientsPolicyId, clientsPolicyMac, clientsPolicyPolicy, clientsPolicyState, clientsCount) => {
        this.dbConfClientsPolicyName = confClientsPolicyName;
        this.dbConfClientsPolicyType = confClientsPolicyType;

        this.dbClientsPolicyId = clientsPolicyId;
        this.dbClientsPolicyMac = clientsPolicyMac;
        this.dbClientsPolicyPolicy = clientsPolicyPolicy;
        this.dbClientsPolicyState = clientsPolicyState;
        this.dbClientsCount = clientsCount;

        for (let i = 0; i < clientsCount; i++) {
          const clientPolicyState = clientsPolicyState[i];

          if (this.dbServices) {
            this.dbServices[i].updateCharacteristic(Characteristic.On, clientPolicyState);
          }

          if (this.dbSensorServices) {
            this.dbSensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, clientPolicyState ? 0 : 1)
          };
        }
      })
        .on('error', (error) => {
          this.log.error(`Network: ${this.name}, ${error}`);
        })
        .on('debug', (message) => {
          this.log(`Network: ${this.name}, debug: ${message}`);
        })
        .on('message', (message) => {
          this.log(`Network: ${this.name}, ${message}`);
        });
    };

    //meraki mr
    if (this.accessPointsControl) {
      this.merakiMr = new MerakiMr({
        host: this.host,
        apiKey: this.apiKey,
        networkId: this.networkId,
        hideUnconfiguredSsid: this.accessPointsHideUnconfiguredSsids,
        hideSsidsName: this.accessPointsHideSsidsByName,
        debugLog: this.enableDebugMode,
        refreshInterval: this.refreshInterval,
      });

      this.merakiMr.on('data', (mrSsidsNumber, mrSsidsName, mrSsidsState, mrSsidsCount) => {
        this.mrSsidsNumber = mrSsidsNumber;
        this.mrSsidsName = mrSsidsName;
        this.mrSsidsState = mrSsidsState;
        this.mrSsidsCount = mrSsidsCount;

        //update characteristics of exposed ssids
        for (let i = 0; i < mrSsidsCount; i++) {
          const state = mrSsidsState[i];
          if (this.mrServices) {
            this.mrServices[i].updateCharacteristic(Characteristic.On, state);
          };

          if (this.mrSensorServices) {
            this.mrSensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1)
          };
        }
      })
        .on('error', (error) => {
          this.log.error(`Network: ${this.name}, ${error}`);
        })
        .on('debug', (message) => {
          this.log(`Network: ${this.name}, debug: ${message}`);
        })
        .on('message', (message) => {
          this.log(`Network: ${this.name}, ${message}`);
        });
    }

    //meraki ms
    if (this.switchesControl) {
      this.merakiMs = new MerakiMs({
        host: this.host,
        apiKey: this.apiKey,
        switches: this.switches,
        debugLog: this.enableDebugMode,
        refreshInterval: this.refreshInterval,
      });

      this.merakiMs.on('data', (msPortsSn, msPortsId, msPortsName, msPortsState, msPortsPoeState, msPortsSensorsEnable, msPortsCount) => {
        this.msPortsSn = msPortsSn;
        this.msPortsId = msPortsId;
        this.msPortsName = msPortsName;
        this.msPortsState = msPortsState;
        this.msPortsPoeState = msPortsPoeState;
        this.msPortsSensorsEnable = msPortsSensorsEnable;
        this.msPortsCount = msPortsCount;

        //update characteristics of exposed ports
        for (let i = 0; i < msPortsCount; i++) {
          const state = msPortsState[i];
          if (this.msServices) {
            this.msServices[i].updateCharacteristic(Characteristic.On, state);
          };

          if (this.msSensorServices) {
            this.msSensorServices[i].updateCharacteristic(Characteristic.ContactSensorState, state ? 0 : 1)
          };
        };
      })
        .on('error', (error) => {
          this.log.error(`Network: ${this.name}, ${error}`);
        })
        .on('debug', (message) => {
          this.log(`Network: ${this.name}, debug: ${message}`);
        })
        .on('message', (message) => {
          this.log(`Network: ${this.name}, ${message}`);
        });
    };

    this.start();
  };

  getDeviceInfo() {
    if (!this.disableLogDeviceInfo && this.checkDeviceInfo) {
      this.log(`-------- ${this.name} --------`);
      this.log(`Manufacturer: Cisco/Meraki`);
      this.log(`Network: ${this.name}`);
      this.log(`Network Id: ${this.networkId}`);
      this.log(`Organization Id: ${this.organizationId}`);
      this.log(`----------------------------------`)
      this.checkDeviceInfo = false;
    };
  };

  async start() {
    try {
      await new Promise(resolve => setTimeout(resolve, 2500));
      const prepareAccessory = this.dbClientsCount > 0 || this.mrSsidsCount > 0 || this.msPortsCount > 0 ? await this.prepareAccessory() : this.log(`Network: ${this.name}, not found configured devices.`);
    } catch (error) {
      this.log.error(`Network: ${this.name}, prepare accessory error: ${error}`);
    };
  };

  //Prepare accessory
  prepareAccessory() {
    return new Promise((resolve, reject) => {
      this.log.debug('prepareAccessory');
      try {
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
        const dbExposedClientsCount = this.dbClientsCount;
        const mrExposedSsidsCount = this.mrSsidsCount;
        const msExposedPortsCount = this.msPortsCount;

        //meraki mx
        if (this.dashboardClientsControl && dbExposedClientsCount > 0) {
          this.dbServices = [];
          for (let i = 0; i < dbExposedClientsCount; i++) {
            const dbClientName = this.dbConfClientsPolicyName[i];
            const dbServiceName = `C. ${dbClientName}`;
            const dbClientPolicyService = new Service.Outlet(dbServiceName, `dbClientPolicyService${i}`);
            dbClientPolicyService.getCharacteristic(Characteristic.On)
              .onGet(async () => {
                const state = this.dbClientsPolicyState[i];
                const policy = state ? this.dbClientsPolicyPolicy[i] : 'Blocked';
                const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Client: % ${dbClientName}, Policy: ${policy}`);
                return state;
              })
              .onSet(async (state) => {
                try {
                  const policy = state ? this.dbConfClientsPolicyType[i] : 'Blocked';
                  const policyUrl = `${this.dashboardClientsUrl}/${this.dbClientsPolicyId[i]}/policy`;
                  const policyData = {
                    'devicePolicy': policy
                  }
                  await this.merakiDb.send(policyUrl, policyData);
                  const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Client: % ${dbClientName}, Policy: ${policy}`);
                } catch (error) {
                  this.log.error(`Network: ${accessoryName}, Client: ${dbClientName}, set Policy error: ${error}`);
                }
              });

            this.dbServices.push(dbClientPolicyService);
            accessory.addService(this.dbServices[i]);
          };

          if (this.dashboardClientsSensor) {
            this.dbSensorServices = [];
            for (let i = 0; i < mrExposedSsidsCount; i++) {
              const dbClientName = this.dbConfClientsPolicyName[i];
              const dbSensorServiceName = `C. Sensor ${dbClientName}`;
              const dbSensorService = new Service.ContactSensor(dbSensorServiceName, `Client Sensor${i}`);
              dbSensorService.getCharacteristic(Characteristic.ContactSensorState)
                .onGet(async () => {
                  const state = this.dbClientsPolicyState[i];
                  return state;
                });

              this.dbSensorServices.push(dbSensorService);
              accessory.addService(this.dbSensorServices[i]);
            };
          };
        };

        //meraki mr
        if (this.accessPointsControl && mrExposedSsidsCount > 0) {
          this.mrServices = [];
          for (let i = 0; i < mrExposedSsidsCount; i++) {
            const ssidName = this.mrSsidsName[i];
            const mrServiceName = `W. ${ssidName}`;
            const mrService = new Service.Outlet(mrServiceName, `mrService${i}`);
            mrService.getCharacteristic(Characteristic.On)
              .onGet(async () => {
                const state = this.mrSsidsState[i] ?? false;
                const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, SSID: ${ssidName}, state: ${state ? 'Enabled' : 'Disabled'}`);
                return state;
              })
              .onSet(async (state) => {
                try {
                  state = state ? true : false;
                  const mrUrl = `${this.wirelessUrl}/${this.mrSsidsNumber[i]}`;
                  const mrData = {
                    'enabled': state
                  };
                  await this.merakiMr.send(mrUrl, mrData);
                  const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, SSID: ${ssidName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                } catch (error) {
                  this.log.error(`Network: ${accessoryName}, SSID: ${ssidName}, set state error: ${error}`);
                }
              });

            this.mrServices.push(mrService);
            accessory.addService(this.mrServices[i]);
          };

          if (this.accessPointsSsidsSensor) {
            this.mrSensorServices = [];
            for (let i = 0; i < mrExposedSsidsCount; i++) {
              const ssidName = this.mrSsidsName[i];
              const mrSensorServiceName = `W. Sensor ${ssidName}`;
              const mrSensorService = new Service.ContactSensor(mrSensorServiceName, `Ssid Sensor${i}`);
              mrSensorService.getCharacteristic(Characteristic.ContactSensorState)
                .onGet(async () => {
                  const state = this.mrSsidsState[i];
                  return state;
                });
              this.mrSensorServices.push(mrSensorService);
              accessory.addService(this.mrSensorServices[i]);
            };
          };
        };

        //meraki ms
        if (this.switchesControl && msExposedPortsCount > 0) {
          this.msServices = [];
          for (let i = 0; i < msExposedPortsCount; i++) {
            const msPortName = this.msPortsName[i];
            const msServiceName = `${this.msPortsId[i]}. ${msPortName}`;
            const msService = new Service.Outlet(msServiceName, `msService${i}`);
            msService.getCharacteristic(Characteristic.On)
              .onGet(async () => {
                const state = this.msPortsState[i] ?? false;
                const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Port: ${this.msPortsId[i]}, Name: ${msPortName}, state: ${state ? 'Enabled' : 'Disabled'}`);
                return state;
              })
              .onSet(async (state) => {
                try {
                  state = state ? true : false;
                  const switchPortUrl = `/devices/${this.msPortsSn[i]}/switch/ports/${this.msPortsId[i]}`;
                  const switchPortData = {
                    'enabled': state
                  };
                  await this.merakiMs.send(switchPortUrl, switchPortData);
                  const logInfo = this.disableLogInfo ? false : (`Network: ${accessoryName}, Port: ${this.msPortsId[i]}, Name: ${msPortName}, set State: ${state ? 'Enabled' : 'Disabled'}`);
                } catch (error) {
                  this.log.error(`Network: ${accessoryName}, Port: ${this.msPortsId[i]}, Name: ${msPortName}, set state error: %${error}`);
                }
              });

            this.msServices.push(msService);
            accessory.addService(this.msServices[i]);
          };

          const sensorEnabled = this.msPortsSensorsEnable.includes(true);
          if (sensorEnabled) {
            this.msSensorServices = [];
            for (let i = 0; i < msExposedPortsCount; i++) {
              if (this.msPortsSensorsEnable[i]) {
                const msPortName = this.msPortsName[i];
                const msSensorServiceName = `${this.msPortsId[i]}. Sensor ${msPortName}`;
                const msSensorService = new Service.ContactSensor(msSensorServiceName, `Port Sensor${i}`);
                msSensorService.getCharacteristic(Characteristic.ContactSensorState)
                  .onGet(async () => {
                    const state = this.msPortsState[i];
                    return state;
                  });
                this.msSensorServices.push(msSensorService);
                accessory.addService(this.msSensorServices[i]);
              };
            };
          };
        };

        this.api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
        this.log.debug(`Network: ${accessoryName}, published as external accessory.`);
        resolve();
      } catch (error) {
        reject(`prepare accessory error: ${error}.`);
      };
    });
  };
};