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
        if (!account.name || !account.apiKey || !account.organizationId || !account.networkId) {
          log.warn(`Name: ${account.name ? 'OK' : account.name}, api key: ${account.apiKey ? 'OK' : account.apiKey}, organization Id: ${account.organizationId ? 'OK' : account.organizationId}, network Id: ${account.networkId ? 'OK' : account.networkId} in config missing.`);
          return;
        }
        const debug = account.enableDebugMode ? log(`Network: ${account.name}, did finish launching.`) : false;

        //meraki account
        const merakiDevice = new MerakiDevice(api, account);
        merakiDevice.on('publishAccessory', (accessory, accessoryName) => {

          //publish devices
          api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
          const debug = account.enableDebugMode ? log(`Network: ${account.name}, ${accessoryName}, published as external accessory.`) : false;
        })
          .on('devInfo', (devInfo) => {
            log(devInfo);
          })
          .on('message', (message) => {
            log(`Network: ${account.name}, ${message}`);
          })
          .on('debug', (debug) => {
            log(`Network: ${account.name}, debug: ${debug}`);
          })
          .on('error', (error) => {
            log.error(`Network: ${account.name}, ${error}`);
          });
      }
    });
  }

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

module.exports = (api) => {
  api.registerPlatform(CONSTANS.PluginName, CONSTANS.PlatformName, MerakiPlatform, true);
}