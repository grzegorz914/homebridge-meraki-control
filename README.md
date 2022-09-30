<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-meraki-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/main/graphics/meraki.png" width="640"></a>
</p>

<span align="center">

# Homebridge Meraki Control  
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-meraki-control?color=purple)](https://www.npmjs.com/package/homebridge-meraki-control) 
[![npm](https://badgen.net/npm/v/homebridge-meraki-control?color=purple)](https://www.npmjs.com/package/homebridge-meraki-control)
[![npm](https://img.shields.io/npm/v/homebridge-meraki-control/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-meraki-control)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-meraki-control.svg)](https://github.com/grzegorz914/homebridge-meraki-control/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-meraki-control.svg)](https://github.com/grzegorz914/homebridge-meraki-control/issues)

 Homebridge plugin for Meraki Dashboard and Devices control using RESTFull API.
  
</span>

## Package Requirements
| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Recommended |
| [Meraki Control](https://www.npmjs.com/package/homebridge-meraki-control) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-meraki-control/wiki) | Homebridge Plug-In | Required |

## About The Plugin
* Dashboard:
  * Expose `Clients` filtered by *Mac Address*.
  * Apply policy `Normal, Whitelisted, Group Policy` / `Blocked` for clients.
* Access Points:
  * Switch `ON/OFF SSIDs` in the organisation.
  * Hide `Unconfigured SSIDs` networks, if the name contain word *Unconfigured*.
  * Hide `SSIDs` filtered by network *Name*.
* Switches:
  * Switch `ON/OFF` ports.
  * Hide `Uplink` ports, if the port name contain word *Uplink*.
  * Hide `Ports` filtered by port *Name*.
* Siri can be used to switch ON/OFF SSIDs, Policy, Ports.
* Home automations and shortcuts can be used for all functions.
* More comming soon...

## Configuration
* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) to configure this plugin (Highly Recommended). 
* The sample configuration can be edited and used manually as an alternative. 
* See the `sample-config.json` file example or copy the example below into your config.json file, making the apporpriate changes before saving it. 
* Be sure to always make a backup copy of your config.json file before making any changes to it.saving it.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-meraki-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description | 
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *API Path* like `https://n123.meraki.com`, do not use `https://api.meraki.com`. |
| `apiKey` | Here set the *X-Cisco-Meraki-API-Key*. |
| `organizationId` | Here set the *Organization Id*. |
| `networkId` | Here set the *Network Id*. |
| `refreshInterval` | Here set the data refresh time in seconds. |
| `enableDebugMode` | This enable deep log in homebridge console. |
| `disableLogInfo` | This disable display log values and states on every it change. |
| `disableLogDeviceInfo` | This disable display log device info on plugin start. |
| `dashboardClientsPolicy.name` | Here set the *Name* to be displayed in the the *Homebridge/HomeKit* for this Client. |
| `dashboardClientsPolicy.mac` | Here set the *Client Mac Address* which You want expose to the *Homebridge/HomeKit*. |
| `dashboardClientsPolicy.type` | Here choice the policy *Type* to be appiled for this Client. |
| `dashboardClientsPolicy.mode` | Here *Activate/Deactivate* this Client control. |
| `accessPointsControl` | This option *Enable/Disable* control of Access Points. |
| `hideUnconfiguredSsids` | If enabled, all *Unconfigured SSIDs* will be hidden and not exposed to the *Homebridge/HomeKit*. |
| `hideSsids.name` | Here set *SSID Name* which You want hide and not expose to the *Homebridge/HomeKit*. |
| `hideSsids.mode` | Here *Activate/Deactivate* this SSID control. |
| `switchesControl` | This option *Enable/Disable* control of Switches. |
| `switches.name` | Here set the *Name* for this Switch. |
| `switches.serialNumber` | Here set the *Serial Number* for this Switch. |
| `switches.hideUplinkPorts` | If enabled, all *Uplink* ports will be hidden and not exposed to the *Homebridge/HomeKit*. |
| `switches.mode` | Here *Activate/Deactivate* this Swich control. |
| `switches.hidePorts` | Array of hidden Ports. |
| `switches.hidePorts.name` | Here set *Port Name* which You want hide and not expose to the *Homebridge/HomeKit*. |
| `switches.hidePorts.mode` | Here *Activate/Deactivate* this Port control. |

```json
        {
            "platform": "Meraki",
            "devices": [
                {
                    "name": "Network Name",
                    "host": "https://123.meraki.com",
                    "apiKey": "01032453453421923",
                    "organizationId": "123456789",
                    "networkId": "L_0123456789",
                    "refreshInterval": 10,
                    "disableLogInfo": false,
                    "disableLogDeviceInfo": false,
                    "enableDebugMode": false,
                    "dashboardClientsPolicy": [{
                         "name": "Own Name",
                         "mac": "Mac Address",
                         "type": "Policy type",
                         "mode": false
                    }],
                    "accessPointsControl": false,
                    "hideUnconfiguredSsids": false,
                    "hideSsids": [{
                         "name": "SSID Name",
                         "mode": false
                     }],
                     "switchesControl": false,
                     "switches": [{
                         "name": "Switch Name",
                         "serialNumber": "O1H1-GL5D-AXXX",
                         "hideUplinkPorts": false,
                         "mode": false,
                         "hidePorts": [{
                              "name": "Port Name",
                              "mode": true
                         }]
                     }]
                }
            ]
        }
```
