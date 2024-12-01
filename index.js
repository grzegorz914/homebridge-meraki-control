import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import DeviceDb from './src/devicedb.js';
import DeviceMr from './src/devicemr.js';
import DeviceMs from './src/devicems.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { PluginName, PlatformName } from './src/constants.js';

class MerakiPlatform {
  constructor(log, config, api) {
    // only load if configured
    if (!config || !Array.isArray(config.devices)) {
      log.warn(`No configuration found for ${PluginName}`);
      return;
    }
    this.accessories = [];

    //check if prefs directory exist
    const prefDir = join(api.user.storagePath(), 'meraki');
    try {
      mkdirSync(prefDir, { recursive: true });
    } catch (error) {
      log.error(`Prepare directory error: ${error.message ?? error}`);
      return;
    }

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
        const debug = enableDebugMode ? log.info(`Network: ${accountName}, did finish launching.`) : false;
        const config = {
          ...account,
          apiKey: 'removed',
          organizationId: 'removed',
          networkId: 'removed'
        };
        const debug1 = enableDebugMode ? log.info(`Network: ${accountName}, Config: ${JSON.stringify(config, null, 2)}`) : false;

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

          //push configured clients policy to device
          const clientsPolicyExist = configuredClientsPolicy.length > 0;
          if (clientsPolicyExist) {
            const obj = {
              'type': 0,
              'name': 'Dashboard',
              'uuid': organizationId,
              'deviceData': configuredClientsPolicy
            };
            allDevices.push(obj);
          };
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

          //push configured ssids to devices
          const hideSsidNameExist = configuredHidenSsidsName.length > 0;
          if (hideSsidNameExist) {
            const obj = {
              'type': 1,
              'name': 'Access Points',
              'uuid': networkId,
              'deviceData': configuredHidenSsidsName
            };
            allDevices.push(obj);
          };
        };

        //switches
        const msSwitchesControl = account.switchesControl || false;
        if (msSwitchesControl) {
          const switches = account.switches || [];

          //configured switches
          for (const sw of switches) {
            const swSerialNumber = sw.serialNumber ?? false;
            const swEnabled = sw.mode || false;

            //push configured switch to array
            const msSwitchExist = swSerialNumber && swEnabled;
            if (msSwitchExist) {
              const obj = {
                'type': 2,
                'name': sw.name,
                'uuid': sw.serialNumber,
                'deviceData': sw
              };
              allDevices.push(obj);
            };
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
              try {
                const dbDevice = new DeviceDb(api, account, deviceName, deviceUuid, deviceData);
                dbDevice.on('publishAccessory', (accessory) => {

                  //publish devices
                  api.publishExternalAccessories(PluginName, [accessory]);
                  log.success(`${accountName}, ${deviceName}, Published as external accessory.`);
                })
                  .on('devInfo', (devInfo) => {
                    log.info(devInfo);
                  })
                  .on('success', (message) => {
                    log.success(`${accountName}, ${deviceName}, ${message}`);
                  })
                  .on('message', (message) => {
                    log.info(`${accountName}, ${deviceName}, ${message}`);
                  })
                  .on('debug', (debug) => {
                    log.info(`${accountName}, ${deviceName}, debug: ${debug}`);
                  })
                  .on('warn', (warn) => {
                    log.warn(`${accountName}, ${deviceName}, debug: ${warn}`);
                  })
                  .on('error', (error) => {
                    log.error(`${accountName}, ${deviceName}, ${error}`);
                  });

                //create impulse generator
                const impulseGenerator = new ImpulseGenerator();
                impulseGenerator.on('start', async () => {
                  try {
                    await dbDevice.start();
                    impulseGenerator.stop();
                  } catch (error) {
                    log.error(`${accountName}, ${deviceName}, ${error}, trying again.`);
                  };
                }).on('state', (state) => {
                  const debug = enableDebugMode ? state ? log.info(`${accountName}, ${deviceName}, Start impulse generator started.`) : log.info(`${accountName}, ${deviceName}, Start impulse generator stopped.`) : false;
                });

                //start impulse generator
                impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
              } catch (error) {
                log.error(`${accountName}, ${deviceName}, Did finish launching error: ${error}`);
              }
              break
            case 1: //access point
              try {
                const mrDevice = new DeviceMr(api, account, deviceName, deviceUuid, deviceData);
                mrDevice.on('publishAccessory', (accessory) => {

                  //publish devices
                  api.publishExternalAccessories(PluginName, [accessory]);
                  log.success(`${accountName}, ${deviceName}, Published as external accessory.`);
                })
                  .on('devInfo', (devInfo) => {
                    log.info(devInfo);
                  })
                  .on('success', (message) => {
                    log.success(`${accountName}, ${deviceName}, ${message}`);
                  })
                  .on('message', (message) => {
                    log.info(`${accountName}, ${deviceName}, ${message}`);
                  })
                  .on('debug', (debug) => {
                    log.info(`${accountName}, ${deviceName}, debug: ${debug}`);
                  })
                  .on('warn', (warn) => {
                    log.warn(`${accountName}, ${deviceName}, debug: ${warn}`);
                  })
                  .on('error', (error) => {
                    log.error(`${accountName}, ${deviceName}, ${error}`);
                  });

                //create impulse generator
                const impulseGenerator = new ImpulseGenerator();
                impulseGenerator.on('start', async () => {
                  try {
                    await mrDevice.start();
                    impulseGenerator.stop();
                  } catch (error) {
                    log.error(`${accountName}, ${deviceName}, ${error}, trying again.`);
                  };
                }).on('state', (state) => {
                  const debug = enableDebugMode ? state ? log.info(`${accountName}, ${deviceName}, Start impulse generator started.`) : log.info(`${accountName}, ${deviceName}, Start impulse generator stopped.`) : false;
                });

                //start impulse generator
                impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
              } catch (error) {
                log.error(`${accountName}, ${deviceName}, Did finish launching error: ${error}`);
              }
              break
            case 2: //switch
              try {
                const msDevice = new DeviceMs(api, account, deviceName, deviceUuid, deviceData);
                msDevice.on('publishAccessory', (accessory) => {

                  //publish devices
                  api.publishExternalAccessories(PluginName, [accessory]);
                  log.success(`${accountName}, ${deviceName}, Published as external accessory.`);
                })
                  .on('devInfo', (devInfo) => {
                    log.info(devInfo);
                  })
                  .on('success', (message) => {
                    log.success(`${accountName}, ${deviceName}, ${message}`);
                  })
                  .on('message', (message) => {
                    log.info(`${accountName}, ${deviceName}, ${message}`);
                  })
                  .on('debug', (debug) => {
                    log.info(`${accountName}, ${deviceName}, debug: ${debug}`);
                  })
                  .on('warn', (warn) => {
                    log.warn(`${accountName}, ${deviceName}, debug: ${warn}`);
                  })
                  .on('error', (error) => {
                    log.error(`${accountName}, ${deviceName}, ${error}`);
                  });

                //create impulse generator
                const impulseGenerator = new ImpulseGenerator();
                impulseGenerator.on('start', async () => {
                  try {
                    await msDevice.start();
                    impulseGenerator.stop();
                  } catch (error) {
                    log.error(`${accountName}, ${deviceName}, ${error}, trying again.`);
                  };
                }).on('state', (state) => {
                  const debug = enableDebugMode ? state ? log.info(`${accountName}, ${deviceName}, Start impulse generator started.`) : log.info(`${accountName}, ${deviceName}, Start impulse generator stopped.`) : false;
                });

                //start impulse generator
                impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
              } catch (error) {
                log.error(`${accountName}, ${deviceName}, Did finish launching error: ${error}`);
              }
              break
            default:
              log.warn(`Unknown device type: ${deviceType}.`);
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

export default (api) => {
  api.registerPlatform(PluginName, PlatformName, MerakiPlatform, true);
}