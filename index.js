import { join } from 'path';
import { mkdirSync } from 'fs';
import axios from 'axios';
import DeviceDb from './src/devicedb.js';
import DeviceMr from './src/devicemr.js';
import DeviceMs from './src/devicems.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { PluginName, PlatformName, ApiUrls } from './src/constants.js';

class MerakiPlatform {
  constructor(log, config, api) {
    if (!config || !Array.isArray(config.devices)) {
      log.warn(`No configuration found for ${PluginName}`);
      return;
    }

    this.accessories = [];

    const prefDir = join(api.user.storagePath(), 'meraki');
    try {
      mkdirSync(prefDir, { recursive: true });
    } catch (error) {
      log.error(`Prepare directory error: ${error.message ?? error}`);
      return;
    }

    api.on('didFinishLaunching', () => {
      // Each account is set up independently — a failure in one does not
      // block the others. Promise.allSettled runs all in parallel.
      Promise.allSettled(
        config.devices.map(account =>
          this.setupAccount(account, prefDir, log, api)
        )
      ).then(results => {
        results.forEach((result, i) => {
          if (result.status === 'rejected') {
            log.error(`Account[${i}] setup error: ${result.reason?.message ?? result.reason}`);
          }
        });
      });
    });
  }

  // ── Per-account setup ───────────────────────────────────────────────────────

  async setupAccount(account, prefDir, log, api) {
    if (account.disableAccessory) return;

    const { name: accountName, apiKey, organizationId, networkId } = account;

    if (!accountName || !apiKey || !organizationId || !networkId) {
      log.warn(
        `Name: ${accountName ? 'OK' : accountName}, ` +
        `api key: ${apiKey ? 'OK' : apiKey}, ` +
        `organization Id: ${organizationId ? 'OK' : organizationId}, ` +
        `network Id: ${networkId ? 'OK' : networkId} in config missing.`
      );
      return;
    }

    const logLevel = {
      devInfo: account.log?.deviceInfo ?? false,
      success: account.log?.success ?? false,
      info: account.log?.info ?? false,
      warn: account.log?.warn ?? false,
      error: account.log?.error ?? false,
      debug: account.log?.debug ?? false
    };

    if (logLevel.debug) {
      log.info(`Network: ${accountName}, did finish launching.`);
      const safeConfig = { ...account, apiKey: 'removed', organizationId: 'removed', networkId: 'removed' };
      log.info(`Network: ${accountName}, Config: ${JSON.stringify(safeConfig, null, 2)}`);
    }

    // The startup impulse generator retries the full discover+publish cycle
    // every 120 s until it succeeds, then hands off to the device impulse
    // generators and stops itself.
    const impulseGenerator = new ImpulseGenerator()
      .on('start', async () => {
        try {
          await this.startAccount(account, accountName, logLevel, log, api, impulseGenerator);
        } catch (error) {
          if (logLevel.error) log.error(`${accountName}, Start impulse generator error, ${error.message ?? error}, trying again.`);
        }
      })
      .on('state', (state) => {
        if (logLevel.debug) log.info(`${accountName}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
      });

    await impulseGenerator.state(true, [{ name: 'start', sampling: 120_000 }]);
  }

  // ── Discover and register accessories for one account ──────────────────────

  async startAccount(account, accountName, logLevel, log, api, impulseGenerator) {
    const { apiKey, organizationId, networkId } = account;

    const allDevices = this.buildDeviceList(account, organizationId, networkId);

    if (allDevices.length === 0) {
      if (logLevel.warn) log.warn(`Network: ${accountName}, no configured devices found, skipping.`);
      return;
    }

    const client = axios.create({
      baseURL: `${account.host}${ApiUrls.Base}`,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Cisco-Meraki-API-Key': apiKey
      }
    });

    // Register each device as a Homebridge accessory
    for (const device of allDevices) {
      await this.registerDevice(account, accountName, device, client, logLevel, log, api);
    }

    // Stop startup generator — each device now manages its own impulse generator
    await impulseGenerator.state(false);
  }

  // ── Build the flat list of devices configured for one account ───────────────

  buildDeviceList(account, organizationId, networkId) {
    const allDevices = [];

    // dashboard clients
    if (account.dashboardClientsControl) {
      const configuredClientsPolicy = (account.clientsPolicy ?? [])
        .filter(p => !!p.name && !!p.mac && !!p.type && !!p.mode)
        .map(p => ({ ...p, mac: p.mac.split(':').join('') }));

      if (configuredClientsPolicy.length > 0) {
        allDevices.push({
          type: 0,
          name: 'Dashboard',
          uuid: organizationId,
          deviceData: configuredClientsPolicy
        });
      }
    }

    // access points
    if (account.accessPointsControl) {
      const configuredHiddenSsidNames = (account.hideSsids ?? [])
        .filter(s => !!s.name && !!s.mode)
        .map(s => s.name);

      if (configuredHiddenSsidNames.length > 0) {
        allDevices.push({
          type: 1,
          name: 'Access Points',
          uuid: networkId,
          deviceData: configuredHiddenSsidNames
        });
      }
    }

    // switches
    for (const sw of (account.switches ?? [])) {
      if (sw.serialNumber && sw.mode) {
        allDevices.push({
          type: 2,
          name: sw.name,
          uuid: sw.serialNumber,
          deviceData: sw
        });
      }
    }

    return allDevices;
  }

  // ── Register a single device as a Homebridge accessory ─────────────────────

  async registerDevice(account, accountName, device, client, logLevel, log, api) {
    const { type: deviceType, name: deviceName, uuid: deviceUuid, deviceData } = device;

    let configuredDevice;
    switch (deviceType) {
      case 0: // dashboard clients
        configuredDevice = new DeviceDb(api, account, deviceName, deviceUuid, deviceData, client);
        break;
      case 1: // access points
        configuredDevice = new DeviceMr(api, account, deviceName, deviceUuid, deviceData, client);
        break;
      case 2: // switches
        configuredDevice = new DeviceMs(api, account, deviceName, deviceUuid, deviceData, client);
        break;
      default:
        if (logLevel.warn) log.warn(`${accountName}, Unknown device type: ${deviceType}, skipping.`);
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
    if (!accessory) {
      if (logLevel.warn) log.warn(`${accountName} ${deviceName}, start() returned no accessory, skipping.`);
      return;
    }

    api.publishExternalAccessories(PluginName, [accessory]);
    if (logLevel.success) log.success(`Device: ${accountName} ${deviceName}, Published as external accessory.`);

    // Each device manages its own impulse generator lifecycle
    await configuredDevice.startImpulseGenerator();
  }

  // ── Homebridge accessory cache ──────────────────────────────────────────────

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }
}

export default (api) => {
  api.registerPlatform(PluginName, PlatformName, MerakiPlatform);
};