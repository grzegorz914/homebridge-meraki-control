# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Link plugin locally for testing with a live Homebridge instance
npm link

# No test suite — the test script exits 1 intentionally
```

There is no build step — the plugin runs directly as ES modules (Node `"type": "module"`).

## Architecture

This is a **Homebridge platform plugin** that exposes Cisco Meraki network devices as HomeKit accessories via the Meraki Dashboard API.

### Entry point

`index.js` — registers `MerakiPlatform` with Homebridge. On `didFinishLaunching`, it reads `config.devices[]`, runs all accounts in parallel via `Promise.allSettled`, and uses a startup `ImpulseGenerator` (120 s retry loop) to discover and publish devices. Once all accessories for an account are registered, the startup generator stops and each device manages its own polling loop.

### Device type routing (`index.js → buildDeviceList`)

Three device types, selected by integer `type`:

| type | Class | Meraki concept |
|------|-------|----------------|
| 0 | `DeviceDb` + `MerakiDb` | Dashboard clients (network policy control) |
| 1 | `DeviceMr` + `MerakiMr` | Access points / wireless SSIDs |
| 2 | `DeviceMs` + `MerakiMs` | Switches (port enable/disable + optional PoE) |

### Two-layer pattern per device type

Each device type is split into two classes:

- **`Device*` (device layer)** — owns the HAP/HomeKit accessory, `Service.Outlet` for each controllable entity (client, SSID, port), optional `Service.ContactSensor` mirrors, and wires `onGet`/`onSet` handlers that call the Meraki layer. Lives in `src/devicedb.js`, `src/devicemr.js`, `src/devicems.js`.

- **`Meraki*` (API layer)** — owns the axios client, calls the REST API, emits `deviceInfo` (first run) and `deviceState` (every poll), and owns its own `ImpulseGenerator` for periodic refresh. Lives in `src/merakidb.js`, `src/merakimr.js`, `src/merakims.js`.

The Device layer listens to `deviceState` events and calls `updateCharacteristic` to push state changes into HomeKit without polling from the HAP side.

### ImpulseGenerator (`src/impulsegenerator.js`)

A thin `EventEmitter` wrapper around `setInterval`. Call `state(true, [{name, sampling}])` to start named timers; `state(false)` clears them. Each Meraki API class uses one internally with a `connect` event that fires the poll. A boolean `locks` flag prevents overlapping concurrent requests.

### API client

A single `axios` instance per account is created in `index.js` with `baseURL = host + /api/v1` and the `X-Cisco-Meraki-API-Key` header. It is passed down through the Device and Meraki class constructors — no global state.

### HomeKit accessory publishing

All accessories are published as **external accessories** via `api.publishExternalAccessories(PluginName, [accessory])`. They require separate pairing codes and do not appear under the bridge.

### Configuration shape (relevant fields)

- `config.devices[]` — array of accounts/networks
- Per account: `apiKey`, `organizationId`, `networkId`, `refreshInterval` (seconds, default 5)
- `dashboardClientsControl` + `clientsPolicy[]` → type 0
- `accessPointsControl` + `hideSsids[]` → type 1
- `switches[]` (each with `serialNumber`, `mode`) → type 2
- `log.{deviceInfo,success,info,warn,error,debug}` — per-level flags, all boolean

See `sample-config.json` for a full annotated example and `config.schema.json` for the JSON Schema used by the Homebridge UI.
