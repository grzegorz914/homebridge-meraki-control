<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-meraki-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/master/graphics/meraki.png" height="280"></a>
</p>

<span align="center">

# Homebridge Meraki Control
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-meraki-control?color=purple)](https://www.npmjs.com/package/homebridge-meraki-control) [![npm](https://badgen.net/npm/v/homebridge-meraki-control?color=purple)](https://www.npmjs.com/package/homebridge-meraki-control)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-meraki-control.svg)](https://github.com/grzegorz914/homebridge-meraki-control/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-meraki-control.svg)](https://github.com/grzegorz914/homebridge-meraki-control/issues)

Homebridge plugin for Meraki Dashboard and Devices control using RESTFull API.

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
* You have possibility switch `ON/OFF SSIDs networks` in Your organisation (MR devices).
* You have possibility hidden `Unconfigured SSIDs` networks, this option is available in plugin settings.
* You have possibility hidden `SSIDs networks` by network name, this option is available in plugin settings.
* You have possibility expose `Clients` filtered by *Mac Address* and change its policy `Normal` / `Blocked`.
* More comming soon...

## Configuration
Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) plugin to configure this plugin (strongly recomended). The sample configuration can be edited and used manually as an alternative. See the `sample-config.json` file in this repository for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.
| Key | Description | 
| --- | --- |
| `name` | Here set the name. |
| `host` | Here set the *baseUrl* like `https://n123.meraki.com`, do not use `https://api.meraki.com` |
| `apiKey` | Here set the *X-Cisco-Meraki-API-Key*. |
| `organizationId` | Here set Your *Organization Id*. |
| `networkId` | Here set Your *Network Id*. |
| `refreshInterval` | Here set the data refresh time in seconds. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in *Homebridge* log. |
| `hideUnconfiguredSsids` | If enabled, all *Unconfigured SSIDs* will be hidden. |
| `hideSsidByName.name` | Here set SSIDs name which You want hide and not expose to the *Homebridge/HomeKit*. |
| `hideSsidByName.mode` | Here set mode *ON/OFF* for this SSID. |
| `dashboartdClientsPolicy.name` | Here set the own *Name* to be displayed in the the *Homebridge/HomeKit* for this Client. |
| `dashboartdClientsPolicy.mac` | Here set the Client *Mac Address from Meraki Dashboard* which You want expose to the *Homebridge/HomeKit* and change its policy. |
| `dashboartdClientsPolicy.mode` | Here set the mode *ON/OFF* for this Client. |


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
                    "hideUnconfiguredSsids": false,
                    "hideSsidByName": [{
                         "name": "SSID Name",
                         "mode": false
                     }],
                    "dashboartdClientsPolicy": [{
                         "name": "Own Name",
                         "mac": "Mac Address",
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
