<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-meraki-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/master/graphics/meraki.png" height="280"></a>
</p>

<span align="center">

# Homebridge Meraki Control
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-meraki-control?color=purple)](https://www.npmjs.com/package/homebridge-meraki-control) [![npm](https://badgen.net/npm/v/homebridge-meraki-control?color=purple)](https://www.npmjs.com/package/homebridge-meraki-control)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-meraki-control.svg)](https://github.com/grzegorz914/homebridge-meraki-control/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-meraki-control.svg)](https://github.com/grzegorz914/homebridge-meraki-control/issues)

Homebridge plugin for Meraki devices using RESTFull API.

</span>

## Package
1. [Homebridge](https://github.com/homebridge/homebridge)
2. [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)

## Installation
1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-meraki-control using: `npm install -g homebridge-meraki-control` or search for `meraki` in Config UI X.

## Know issues
1. If use with Hoobs possible config incompatibilty.

## HomeKit pairing
1. Each accessories needs to be manually paired. 
2. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' height='16.42px'> app on your device. 
3. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' height='16.42px'>. 
4. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*. 
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Note
1. Versin 0.6.0 and above need to be used with Homebridge min. v1.3.x.

## Info
1. This plugin control ON/OFF configured WLAN networks in Your organisation (MR devices).
2. You have possibility hidden all unconfigured networks, this option is available in plugin settings.
3. You have possibility hidden networks by configured name, this option is available in plugin settings.
4. More comming soon...

## Configuration
1. Use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to configure the plugin (strongly recomended), or update your configuration file manually. See `sample-config.json` in this repository for a sample or add the bottom example to Your config.json file.
2. In `host` set the baseUrl like `https://n123.meraki.com`, do not use `https://api.meraki.com.`
3. In `apiKey` set the X-Cisco-Meraki-API-Key.
4. In `organizationId` set Your organizationId.
5. In `networkId` set Your networkId.
5. In `deviceSerial` set device serial.
6. In `wlanControl` set numbers of configured SSIDs in Your network. (removed in 0.5.0 and above)
7. In `refreshInterval` set the data refresh time in seconds.
8. If `disableLogInfo` is enabled, disable log info, all values and state will not be displayed in Homebridge log console.
9. If `hideUnconfiguredSsids` is enabled, all unconfigured SSIDS will be hidden.
10. `filterSsidByName` here set SSIDs names to be filtered and not be exposed to the Home app..
11. `manufacturer`, `model`, `serialNumber`, `firmwareRevision` - optional branding data displayed in Home.app

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-meraki-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/master/graphics/ustawienia.png" height="170"></a>
</p>

```json
        {
            "platform": "Meraki",
            "devices": [
                {
                    "name": "Meraki MR52",
                    "host": "https://n123.meraki.com",
                    "apiKey": "01032453453421923",
                    "organizationId": "123456789",
                    "networkId": "L_0123456789",
                    "refreshInterval": 10,
                    "disableLogInfo": false,
                    "hideUnconfiguredSsids": false,
                     "filterSsidByName": [
                        {
                          "name": "SSID Name"
                        }
                      ],
                    "manufacturer": "Manufacturer",
                    "modelName": "Model",
                    "serialNumber": "Serial Number",
                    "firmwareRevision": "Firmware Revision"
                }
            ]
        }
```

## Whats new:
https://github.com/grzegorz914/homebridge-meraki-control/blob/master/CHANGELOG.md

## Development
- Pull request and help in development highly appreciated.
