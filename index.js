'use strict';
const path = require('path');
const fs = require('fs');
const MerakiDevice = require('./src/merakidevice.js');
const CONSTANS = require('./src/constans.json');

class MerakiPlatform {
  constructor(log, config, api) {
    // only load if configured
    if (!config || !Array.isArray(config.devices)) {
      log.warn(`No configuration found for ${CONSTANS.PluginName}`);
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
        const debug = account.enableDebugMode ? log(`Network: ${accountName}, did finish launching.`) : false;
        const allDevices = [];

        //dashboard clients
        const dashboardClientsControl = account.dashboardClientsControl || false;
        if (dashboardClientsControl) {
          const configuredClientsPolicy = account.clientsPolicy || [];

          //configured clients policy
          const clientsPolicy = [];
          for (const clientPolicy of configuredClientsPolicy) {
            const policyName = clientPolicy.name;
            const policyEnabled = clientPolicy.mode || false;
            const push = policyEnabled && policyName ? clientsPolicy.push(policyName) : false;
          };

          const clientsPolicyCount = clientsPolicy.length;
          const obj = {
            'type': 0,
            'name': 'Dashboard',
            'uuid': organizationId,
            'deviceData': clientsPolicy
          };
          const push = clientsPolicyCount > 0 ? allDevices.push(obj) : false;
        };

        //access points
        const accessPointsControl = account.accessPointsControl || false;
        if (accessPointsControl) {
          const hideSsids = account.hideSsids || [];

          //hidde ssids by name
          const hidenSsidsName = [];
          for (const hideSsid of hideSsids) {
            const hideSsidName = hideSsid.name;
            const hideSsidEnabled = hideSsid.mode || false;
            const push = hideSsidEnabled && hideSsidName ? hidenSsidsName.push(hideSsidName) : false;
          };

          const obj = {
            'type': 1,
            'name': 'Access Points',
            'uuid': networkId,
            'deviceData': hidenSsidsName
          };
          allDevices.push(obj);
        };

        //switches
        const switches = account.switches || [];
        for (const sw of switches) {
          const swSerialNumber = sw.serialNumber || false;
          const swEnabled = sw.mode || false;

          const swControl = swSerialNumber && swEnabled;
          const obj = {
            'type': 2,
            'name': sw.name,
            'uuid': sw.serialNumber,
            'deviceData': sw
          };
          const push = swControl ? allDevices.push(obj) : false;
        };

        //meraki devices
        for (const device of allDevices) {
          const deviceType = device.type;
          const deviceName = device.name;
          const deviceUuid = device.uuid;
          const deviceData = device.deviceData;
          const merakiDevice = new MerakiDevice(api, account, deviceType, deviceName, deviceUuid, deviceData);
          merakiDevice.on('publishAccessory', (accessory) => {

            //publish devices
            api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
            const debug = account.enableDebugMode ? log(`${accountName}, ${deviceName}, published as external accessory.`) : false;
          })
            .on('devInfo', (devInfo) => {
              log(devInfo);
            })
            .on('message', (message) => {
              log(accountName, deviceName, message);
            })
            .on('debug', (debug) => {
              log(`${accountName}, ${deviceName}. debug: ${debug}`);
            })
            .on('error', (error) => {
              log.error(accountName, deviceName, error);
            });
        };
      };
    });
  };

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

module.exports = (api) => {
  api.registerPlatform(CONSTANS.PluginName, CONSTANS.PlatformName, MerakiPlatform, true);
}