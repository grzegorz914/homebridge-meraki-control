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

    api.on('didFinishLaunching', async () => {
      for (const account of config.devices) {

        //check accessory is enabled
        const disableAccessory = account.disableAccessory || false;
        if (disableAccessory) {
          continue;
        }

        const accountName = account.name;
        const apiKey = account.apiKey;
        const organizationId = account.organizationId;
        const networkId = account.networkId;

        if (!accountName || !apiKey || !organizationId || !networkId) {
          log.warn(`Name: ${accountName ? 'OK' : accountName}, api key: ${apiKey ? 'OK' : apiKey}, organization Id: ${organizationId ? 'OK' : organizationId}, network Id: ${networkId ? 'OK' : networkId} in config missing.`);
          return;
        }

        //log config
        const enableDebugMode = account.enableDebugMode || false;
        const disableLogDeviceInfo = account.disableLogDeviceInfo || false;
        const disableLogInfo = account.disableLogInfo || false;
        const disableLogSuccess = account.disableLogSuccess || false;
        const disableLogWarn = account.disableLogWarn || false;
        const disableLogError = account.disableLogError || false;
        const debug = enableDebugMode ? log.info(`Network: ${accountName}, did finish launching.`) : false;
        const config = {
          ...account,
          apiKey: 'removed',
          organizationId: 'removed',
          networkId: 'removed'
        };
        const debug1 = !enableDebugMode ? false : log.info(`Network: ${accountName}, Config: ${JSON.stringify(config, null, 2)}`);

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
          }

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
          }
        }

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
          }

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
          }
        }

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
            }
          }
        }

        //meraki devices
        for (const device of allDevices) {
          const deviceType = device.type;
          const deviceName = device.name;
          const deviceUuid = device.uuid;
          const deviceData = device.deviceData;

          let configuredDevice;
          switch (deviceType) {
            case 0: //dashboard clients
              configuredDevice = new DeviceDb(api, account, deviceName, deviceUuid, deviceData);
              break
            case 1: //access point
              configuredDevice = new DeviceMr(api, account, deviceName, deviceUuid, deviceData);
              break
            case 2: //switch
              configuredDevice = new DeviceMs(api, account, deviceName, deviceUuid, deviceData);
              break
            default:
              const emitLog = disableLogWarn ? false : log.warn(`Unknown device type: ${deviceType}.`);
              break;
          }

          try {
            configuredDevice.on('publishAccessory', (accessory) => {
              api.publishExternalAccessories(PluginName, [accessory]);
              const emitLog = disableLogSuccess ? false : log.success(`${accountName}, ${deviceName}, Published as external accessory.`);
            })
              .on('devInfo', (devInfo) => {
                const emitLog = disableLogDeviceInfo ? false : log.info(devInfo);
              })
              .on('success', (success) => {
                const emitLog = disableLogSuccess ? false : log.success(`${accountName}, ${deviceName}, ${success}.`);
              })
              .on('info', (info) => {
                const emitLog = disableLogInfo ? false : log.info(`${accountName}, ${deviceName}, ${info}.`);
              })
              .on('debug', (debug) => {
                const emitLog = !enableDebugMode ? false : log.info(`${accountName}, ${deviceName}, debug: ${debug}.`);
              })
              .on('warn', (warn) => {
                const emitLog = disableLogWarn ? false : log.warn(`${accountName}, ${deviceName}, ${warn}.`);
              })
              .on('error', (error) => {
                const emitLog = disableLogError ? false : log.error(`${accountName}, ${deviceName}, ${error}.`);
              });

            //create impulse generator
            const impulseGenerator = new ImpulseGenerator();
            impulseGenerator.on('start', async () => {
              try {
                const startDone = await configuredDevice.start();
                const stopImpulseGenerator = startDone ? await impulseGenerator.stop() : false;

                //start impulse generator 
                const startImpulseGenerator = startDone ? await configuredDevice.startImpulseGenerator() : false
              } catch (error) {
                const emitLog = disableLogError ? false : log.error(`${accountName}, ${deviceName}, ${error}, trying again.`);
              }
            }).on('state', (state) => {
              const emitLog = !enableDebugMode ? false : state ? log.info(`${accountName}, ${deviceName}, Start impulse generator started.`) : log.info(`${accountName}, ${deviceName}, Start impulse generator stopped.`);
            });

            //start impulse generator
            await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
          } catch (error) {
            const emitLog = disableLogError ? false : log.error(`${accountName}, ${deviceName}, Did finish launching error: ${error}.`);
          }
        }
      }
    });
  }

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

export default (api) => {
  api.registerPlatform(PluginName, PlatformName, MerakiPlatform);
}