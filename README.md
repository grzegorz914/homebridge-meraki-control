<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-meraki-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/main/graphics/meraki.png" width="640"></a>
</p>

<span align="center">

# Homebridge Meraki Control  

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://shields.io/npm/dt/homebridge-meraki-control?color=purple)](https://www.npmjs.com/package/homebridge-meraki-control)
[![npm](https://shields.io/npm/v/homebridge-meraki-control?color=purple)](https://www.npmjs.com/package/homebridge-meraki-control)
[![npm](https://img.shields.io/npm/v/homebridge-meraki-control/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-meraki-control)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-meraki-control.svg)](https://github.com/grzegorz914/homebridge-meraki-control/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-meraki-control.svg)](https://github.com/grzegorz914/homebridge-meraki-control/issues)

<a href="https://buycoffee.to/grzegorz914" target="_blank"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/main/graphics/buycoffee-button.png" style="width: 234px; height: 61px" alt="Supports My Work"></a> <a href="https://github.com/grzegorz914/homebridge-meraki-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/main/graphics/QR_buycoffee.png" width="61"></a>
  
</span>

## Package Requirements

| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) | [Homebridge UI Wiki](https://github.com/homebridge/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Recommended |
| [Meraki Control](https://www.npmjs.com/package/homebridge-meraki-control) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-meraki-control/wiki) | Homebridge Plug-In | Required |

## Warning

* For plugin < v1.6.0 use Homebridge UI <= v5.5.0.
* For plugin >= v1.6.0 use Homebridge UI >= v5.13.0.

## About The Plugin

* Dashboard:
  * Expose `Clients` filtered by *Mac Address*.
  * Apply policy `Normal, Whitelisted, Group Policy` / `Blocked` for clients.
  * Enable/Disable prefix `C.` for `Clients` name displayed in HomeKit.app.
  * Expose Contact Sensors in HomeKit app for exposed `Clients`.
* Access Points:
  * Switch `ON/OFF SSIDs` in the organisation.
  * Enable/Disable prefix `W.` for `SSIDs` name displayed in HomeKit.app.
  * Hide `Unconfigured SSIDs` networks, if the name contain word *Unconfigured*.
  * Hide `SSIDs` filtered by network *Name*.
  * Expose Contact Sensors in HomeKit app for exposed `SSIDs`.
* Switches:
  * Switch `ON/OFF` ports.
  * Switch `ON/OFF` POE+ ports.
  * Enable/Disable prefix `Port Number` for `Ports` name displayed in HomeKit.app.
  * Hide `Uplink` ports, if the port name contain word *Uplink*.
  * Hide `Ports` filtered by port *Name*.
  * Expose Contact Sensors in HomeKit app for exposed `Ports`.
* Siri can be used to switch ON/OFF SSIDs, Policy, Ports.
* Home automations and shortcuts can be used for all functions.

## Configuration

* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x/wiki) to configure this plugin.
* The `sample-config.json` can be edited and used as an alternative.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-meraki-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *API URI* like `https://api.meraki.com`. |
| `disableAccessory` | If enabled, the accessory will be disabled. |
| `apiKey` | Here set the *X-Cisco-Meraki-API-Key*. |
| `organizationId` | Here set the *Organization Id*. |
| `networkId` | Here set the *Network Id*. |
| `dashboardClientsControl` | This option *Enable/Disable* dashboard clients control. |
| `enablePrefixForClientName` | This option enable prefix `C.` for *Client* name displayed in HomeKit app. |
| `enableSonsorClients` | This option expose Contact Sensor in HomeKit app for all exposed Clients. |
| `dashboardClientsPolicy.name` | Here set the *Name* to be displayed in the the *Homebridge/HomeKit* for this Client. |
| `dashboardClientsPolicy.mac` | Here set the *Client Mac Address* which You want expose to the *Homebridge/HomeKit*. |
| `dashboardClientsPolicy.type` | Here choice the policy *Type* to be appiled for this Client. |
| `dashboardClientsPolicy.mode` | Here *Activate/Deactivate* this Client control. |
| `accessPointsControl` | This option *Enable/Disable* control of Access Points. |
| `hideUnconfiguredSsids` | If enabled, all *Unconfigured SSIDs* will be hidden and not exposed to the *Homebridge/HomeKit*, the name of  this `SSID` must start with `Unconfigured`. |
| `enablePrefixForSsidsName` | This option enable prefix `W.` for *SSIDs* name displayed in HomeKit app. |
| `hideSsids.name` | Here set *SSID Name* which You want hide and not expose to the *Homebridge/HomeKit*. |
| `hideSsids.mode` | Here *Activate/Deactivate* this SSID control. |
| `enableSonsorSsids` | This option expose Contact Sensor in HomeKit app for all exposed SSIDs. |
| `switchesControl` | This option *Enable/Disable* control of Switches. |
| `switches.name` | Here set the *Name* for this Switch. |
| `switches.serialNumber` | Here set the *Serial Number* for this Switch. |
| `switches.hideUplinkPorts` | If enabled, all *Uplink* ports will be hidden and not exposed to the *Homebridge/HomeKit*, the name of this `Port` must start with `Uplink`. |
| `switches.enablePrefixForPortName` | This option enable prefix `Port Number` for *Port* name displayed in HomeKit app. |
| `switches.enablePoePortsControl` | This option enable POE control for controled ports. |
| `switches.enableSensorPorts` | This option enable POE control for controled ports. |
| `switches.mode` | Here *Activate/Deactivate* this Swich control. |
| `switches.hidePorts` | Array of hidden Ports. |
| `switches.hidePorts.name` | Here set *Port Name* which You want hide and not expose to the *Homebridge/HomeKit*. |
| `switches.hidePorts.mode` | Here *Activate/Deactivate* this Port control. |
| `refreshInterval` | Here set the data refresh time in seconds. |
| `log.deviceInfo` | If enabled, log device info will be displayed by every connections device to the network. |
| `log.success` | If enabled, success log will be displayed in console. |
| `log.info` | If enabled, info log will be displayed in console. |
| `log.warn` | If enabled, warn log will be displayed in console. |
| `log.error` | If enabled, error log will be displayed in console. |
| `log.debug` | If enabled, debug log will be displayed in console. |
