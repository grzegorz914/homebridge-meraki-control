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
        if (disableAccessory) continue;

        const accountName = account.name;
        const apiKey = account.apiKey;
        const organizationId = account.organizationId;
        const networkId = account.networkId;

        if (!accountName || !apiKey || !organizationId || !networkId) {
          log.warn(`Name: ${accountName ? 'OK' : accountName}, api key: ${apiKey ? 'OK' : apiKey}, organization Id: ${organizationId ? 'OK' : organizationId}, network Id: ${networkId ? 'OK' : networkId} in config missing.`);
          continue;
        }

        //log config
        const logLevel = {
          debug: account.enableDebugMode,
          info: !account.disableLogInfo,
          success: !account.disableLogSuccess,
          warn: !account.disableLogWarn,
          error: !account.disableLogError,
          devInfo: !account.disableLogDeviceInfo,
        };

        if (logLevel.debug) log.info(`Network: ${accountName}, did finish launching.`);
        const safeConfig = {
          ...account,
          apiKey: 'removed',
          organizationId: 'removed',
          networkId: 'removed'
        };
        if (logLevel.debug) log.info(`Network: ${accountName}, Config: ${JSON.stringify(safeConfig, null, 2)}`);

        //dashboard clients
        const allDevices = [];
        const dbClientsControl = account.dashboardClientsControl || false;
        if (dbClientsControl) {
          const clientsPolicy = account.clientsPolicy || [];

          //configured clients policy
          const configuredClientsPolicy = [];
          for (const clientPolicy of clientsPolicy) {
            const policyName = clientPolicy.name ?? false;
            const policyMac = clientPolicy.mac ? clientPolicy.mac.split(':').join('') : false;
            const policyType = clientPolicy.type ?? false;
            const policyEnabled = clientPolicy.mode || false;
            if (policyName && policyMac && policyType && policyEnabled) configuredClientsPolicy.push(clientPolicy);
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
            if (hideSsidName && hideSsidEnabled) configuredHidenSsidsName.push(hideSsidName);
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

        if (allDevices.length === 0) continue;

        try {
          //create impulse generator
          const impulseGenerator = new ImpulseGenerator()
            .on('start', async () => {
              try {
                //meraki devices
                for (const device of allDevices) {
                  const deviceType = device.type;
                  const deviceName = device.name;
                  const deviceUuid = device.uuid;
                  const deviceData = device.deviceData

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
                      if (logLevel.warn) log.warn(`Unknown device type: ${deviceType}.`);
                      return;
                  }

                  configuredDevice
                    .on('devInfo', (info) => logLevel.devInfo && log.info(info))
                    .on('success', (msg) => logLevel.success && log.success(`${accountName} ${deviceName}, ${msg}`))
                    .on('info', (msg) => logLevel.info && log.info(`${accountName} ${deviceName}, ${msg}`))
                    .on('debug', (msg) => logLevel.debug && log.info(`${accountName} ${deviceName}, debug: ${msg}`))
                    .on('warn', (msg) => logLevel.warn && log.warn(`${accountName} ${deviceName}, ${msg}`))
                    .on('error', (msg) => logLevel.error && log.error(`${accountName} ${deviceName}, ${msg}`));

                  const accessory = await configuredDevice.start();
                  if (accessory) {
                    api.publishExternalAccessories(PluginName, [accessory]);
                    if (logLevel.success) log.success(`Device: ${accountName} ${deviceName}, Published as external accessory.`);

                    await configuredDevice.startImpulseGenerator();
                    await impulseGenerator.stop();
                  }
                }
              } catch (error) {
                if (logLevel.error) log.error(`${accountName}, Start impulse generator error: ${error.message ?? error}, trying again.`);
              }
            }).on('state', (state) => {
              if (logLevel.debug) log.info(`Device: ${accountName}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
            });

          //start impulse generator
          await impulseGenerator.start([{ name: 'start', sampling: 60000 }]);
        } catch (error) {
          if (logLevel.error) log.error(`${accountName}, Did finish launching error: ${error.message ?? error}.`);
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