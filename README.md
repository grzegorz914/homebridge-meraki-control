<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-meraki-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/master/graphics/meraki.png" height="280"></a>
</p>

<span align="center">

# Homebridge Meraki Control
  Homebridge plugin for Meraki Dashboard and Devices control using RESTFull API.
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-meraki-control?color=purple)](https://www.npmjs.com/package/homebridge-meraki-control) [![npm](https://badgen.net/npm/v/homebridge-meraki-control?color=purple)](https://www.npmjs.com/package/homebridge-meraki-control)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-meraki-control.svg)](https://github.com/grzegorz914/homebridge-meraki-control/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-meraki-control.svg)](https://github.com/grzegorz914/homebridge-meraki-control/issues)

</span>

## Note
1. Versin 0.6.0 and above need to be used with Homebridge min. v1.3.x.

## Know issues
1. If use with Hoobs possible config incompatibilty.

## Package Requirements
| Package Link | Required |
| --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | Required | 
| [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) | Highly Recommended |

## Installation
1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-meraki-control using: `npm install -g homebridge-meraki-control` or search for `meraki` in Config UI X.

## HomeKit pairing
1. Each accessories needs to be manually paired. 
2. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' height='16.42px'> app on your device. 
3. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' height='16.42px'>. 
4. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*. 
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Features and How To Use Them
* Switch `ON/OFF SSIDs networks` in Your organisation (MR devices).
* Hidde `Unconfigured SSIDs` networks, this option is available in plugin settings.
* Hidde `SSIDs networks` by network name, this option is available in plugin settings.
* Expose `Clients` filtered by *Mac Address* and change its policy `Normal, Whitelisted, Group Policy` / `Blocked`.
* Switch `ON/OFF Ports` of switches (MS devices), this option is available in plugin settings, right now only one switch is supported.
* More comming soon...

## Configuration
Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) plugin to configure this plugin (strongly recomended). The sample configuration can be edited and used manually as an alternative. See the `sample-config.json` file in this repository for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.
| Key | Description | 
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *API Path* like `https://n123.meraki.com`, do not use `https://api.meraki.com` |
| `apiKey` | Here set the *X-Cisco-Meraki-API-Key*. |
| `organizationId` | Here set the *Organization Id*. |
| `networkId` | Here set the *Network Id*. |
| `refreshInterval` | Here set the data refresh time in seconds. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in *Homebridge* log. |
| `dashboardClientsPolicy.name` | Here set the *Name* to be displayed in the the *Homebridge/HomeKit* for this Client. |
| `dashboardClientsPolicy.mac` | Here set the client *Mac Address from Meraki Dashboard* which You want expose to the *Homebridge/HomeKit* and change its policy. |
| `dashboardClientsPolicy.type` | Here choice the policy *Type* to be appiled for this Client. |
| `dashboardClientsPolicy.mode` | Here set the mode *ON/OFF* for this Client. |
| `accessPointsControl` | This option *Enable/Disable* control of Access Points. |
| `hideUnconfiguredSsids` | If enabled, all *Unconfigured SSIDs* will be hidden and not exposed to the *Homebridge/HomeKit*. |
| `hideSsids.name` | Here set *SSIDs Name* which You want hide and not expose to the *Homebridge/HomeKit*. |
| `hideSsids.mode` | Here set mode *ON/OFF* for this SSID. |
| `switchesControl` | This option *Enable/Disable* control of Switches. |
| `switches.name` | Here set the *Name* for this Switch. |
| `switches.serialNumber` | Here set the *Serial Number* for this Switch. |
| `switches.mode` | Here set mode *ON/OFF* for this Port. |


<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-meraki-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/master/graphics/ustawienia.png" height="170"></a>
</p>

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
                         "mode": false
                     }]
                }
            ]
        }
```

## Whats new:
https://github.com/grzegorz914/homebridge-meraki-control/blob/master/CHANGELOG.md

## Development
- Pull request and help in development highly appreciated.
