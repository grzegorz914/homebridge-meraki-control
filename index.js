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

        //meraki info
        if (!device.disableLogDeviceInfo) {
          log(`-------- ${device.name} --------`);
          log(`Manufacturer: Cisco/Meraki`);
          log(`Network: ${device.name}`);
          log(`Network Id: ${device.networkId}`);
          log(`Organization Id: ${device.organizationId}`);
          log(`----------------------------------`)
        };

        //meraki device
        const merakiDevice = new MerakiDevice(api, device);
        merakiDevice.on('publishAccessory', (accessory) => {
          api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
          const debug = device.enableDebugMode ? log(`Network: ${device.name}, published as external accessory.`) : false;
        })
          .on('removeAccessory', (accessory) => {
            api.unregisterPlatformAccessories(CONSTANS.PluginName, CONSTANS.PlatformName, [accessory]);
            const debug = device.enableDebugMode ? log(`Accessory: ${accessory}, removed.`) : false;
          })
          .on('message', (message) => {
            log(`Network: ${device.name}, ${message}`);
          })
          .on('debug', (debug) => {
            log(`Network: ${device.name}, ${debug}`);
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