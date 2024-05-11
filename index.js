'use strict';
const path = require('path');
const fs = require('fs');
const DeviceDb = require('./src/devicedb.js');
const DeviceMr = require('./src/devicemr.js');
const DeviceMs = require('./src/devicems.js');
const CONSTANTS = require('./src/constants.json');

class MerakiPlatform {
  constructor(log, config, api) {
    // only load if configured
    if (!config || !Array.isArray(config.devices)) {
      log.warn(`No configuration found for ${CONSTANTS.PluginName}`);
      return;
    }
    this.accessories = [];

    //check if prefs directory exist
    const prefDir = path.join(api.user.storagePath(), 'meraki');
    if (!fs.existsSync(prefDir)) {
      fs.mkdirSync(prefDir);
    };

    api.on('didFinishLaunching', () => {
      for (const account of config.devices) {
        const accountName = account.name;
        const apiKey = account.apiKey;
        const organizationId = account.organizationId;
        const networkId = account.networkId;

        if (!accountName || !apiKey || !organizationId || !networkId) {
          log.warn(`Name: ${accountName ? 'OK' : accountName}, api key: ${apiKey ? 'OK' : apiKey}, organization Id: ${organizationId ? 'OK' : organizationId}, network Id: ${networkId ? 'OK' : networkId} in config missing.`);
          return;
        }

        //debug config
        const enableDebugMode = account.enableDebugMode;
        const debug = enableDebugMode ? log(`Network: ${accountName}, did finish launching.`) : false;
        const config = {
          ...account,
          apiKey: 'removed',
          organizationId: 'removed',
          networkId: 'removed'
        };
        const debug1 = enableDebugMode ? log(`Network: ${accountName}, Config: ${JSON.stringify(config, null, 2)}`) : false;

        //dashboard clients
        const allDevices = [];
        const dbClientsControl = account.dashboardClientsControl || false;
        if (dbClientsControl) {
          const clientsPolicy = account.clientsPolicy || [];

          //configured clients policy
          const configuredClientsPolicy = [];
          for (const clientPolicy of clientsPolicy) {
            const policyName = clientPolicy.name ?? false;
            const policyMac = (clientPolicy.mac).split(':').join('') ?? false;
            const policyType = clientPolicy.type ?? false;
            const policyEnabled = clientPolicy.mode || false;
            const push = policyName && policyMac && policyType && policyEnabled ? configuredClientsPolicy.push(clientPolicy) : false;
          };

          const clientsPolicyExist = configuredClientsPolicy.length > 0;
          const obj = {
            'type': 0,
            'name': 'Dashboard',
            'uuid': organizationId,
            'deviceData': configuredClientsPolicy
          };
          const push = clientsPolicyExist ? allDevices.push(obj) : false;
        };

        //access points
        const mrAccessPointsControl = account.accessPointsControl || false;
        if (mrAccessPointsControl) {
          const hideSsids = account.hideSsids || [];

          //hidde ssids by name
          const configuredHidenSsidsName = [];
          for (const hideSsid of hideSsids) {
            const hideSsidName = hideSsid.name ?? false;
            const hideSsidEnabled = hideSsid.mode || false;
            const push = hideSsidName && hideSsidEnabled ? configuredHidenSsidsName.push(hideSsidName) : false;
          };

          const hideSsidNameExist = configuredHidenSsidsName.length > 0;
          const obj = {
            'type': 1,
            'name': 'Access Points',
            'uuid': networkId,
            'deviceData': configuredHidenSsidsName
          };
          const push = hideSsidNameExist ? allDevices.push(obj) : false;
        };

        //switches
        const msSwitchesControl = account.switchesControl || false;
        if (msSwitchesControl) {
          const switches = account.switches || [];

          //data
          for (const sw of switches) {
            const swSerialNumber = sw.serialNumber ?? false;
            const swEnabled = sw.mode || false;

            const msSwitchExist = swSerialNumber && swEnabled;
            const obj = {
              'type': 2,
              'name': sw.name,
              'uuid': sw.serialNumber,
              'deviceData': sw
            };
            const push = msSwitchExist ? allDevices.push(obj) : false;
          };
        };

        //meraki devices
        for (const device of allDevices) {
          const deviceType = device.type;
          const deviceName = device.name;
          const deviceUuid = device.uuid;
          const deviceData = device.deviceData;

          switch (deviceType) {
            case 0: //dashboard clients
              const dbDevice = new DeviceDb(api, account, deviceName, deviceUuid, deviceData);
              dbDevice.on('publishAccessory', (accessory) => {

                //publish devices
                api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
                const debug = enableDebugMode ? log(`${accountName}, ${deviceName}, published as external accessory.`) : false;
              })
                .on('devInfo', (devInfo) => {
                  log(devInfo);
                })
                .on('message', (message) => {
                  log(`${accountName}, ${deviceName}. ${message}`);
                })
                .on('debug', (debug) => {
                  log(`${accountName}, ${deviceName}. debug: ${debug}`);
                })
                .on('error', (error) => {
                  log.error(`${accountName}, ${deviceName}. ${error}`);
                });
              break
            case 1: //access point
              const mrDevice = new DeviceMr(api, account, deviceName, deviceUuid, deviceData);
              mrDevice.on('publishAccessory', (accessory) => {

                //publish devices
                api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
                const debug = enableDebugMode ? log(`${accountName}, ${deviceName}, published as external accessory.`) : false;
              })
                .on('devInfo', (devInfo) => {
                  log(devInfo);
                })
                .on('message', (message) => {
                  log(`${accountName}, ${deviceName}. ${message}`);
                })
                .on('debug', (debug) => {
                  log(`${accountName}, ${deviceName}. debug: ${debug}`);
                })
                .on('error', (error) => {
                  log.error(`${accountName}, ${deviceName}. ${error}`);
                });
              break
            case 2: //switch
              const msDevice = new DeviceMs(api, account, deviceName, deviceUuid, deviceData);
              msDevice.on('publishAccessory', (accessory) => {

                //publish devices
                api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
                const debug = enableDebugMode ? log(`${accountName}, ${deviceName}, published as external accessory.`) : false;
              })
                .on('devInfo', (devInfo) => {
                  log(devInfo);
                })
                .on('message', (message) => {
                  log(`${accountName}, ${deviceName}. ${message}`);
                })
                .on('debug', (debug) => {
                  log(`${accountName}, ${deviceName}. debug: ${debug}`);
                })
                .on('error', (error) => {
                  log.error(`${accountName}, ${deviceName}. ${error}`);
                });
              break
            default:
              log(`Unknown device type: ${deviceType},`);
              break;
          };
        };
      };
    });
  };

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

module.exports = (api) => {
  api.registerPlatform(CONSTANTS.PluginName, CONSTANTS.PlatformName, MerakiPlatform, true);
}