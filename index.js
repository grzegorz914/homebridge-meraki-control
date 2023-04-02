'use strict';
const MerakiDevice = require('./src/merakidevice.js');
const CONSTANS = require('./src/constans.json');

class MerakiPlatform {
  constructor(log, config, api) {
    // only load if configured
    if (!config || !Array.isArray(config.devices)) {
      log(`No configuration found for ${CONSTANS.PluginName}`);
      return;
    }
    this.accessories = [];

    api.on('didFinishLaunching', () => {
      log.debug('didFinishLaunching');
      for (const device of config.devices) {
        if (!device.name || !device.apiKey || !device.organizationId || !device.networkId) {
          log.warn('Network name, api key, organization Id or network Id missing');
          return
        }

        //meraki device
        const merakiDevice = new MerakiDevice(api, device);
        merakiDevice.on('publishAccessory', (accessory) => {
          api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
          const debug = device.enableDebugMode ? log(`Network: ${device.name}, published as external accessory.`) : false;
        })
          .on('devInfo', (devInfo) => {
            log(devInfo);
          })
          .on('message', (message) => {
            log(`Network: ${device.name}, ${message}`);
          })
          .on('debug', (debug) => {
            log(`Network: ${device.name}, debug: ${debug}`);
          })
          .on('error', (error) => {
            log.error(`Network: ${device.name}, ${error}`);
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