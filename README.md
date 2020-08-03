<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-meraki-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/master/graphics/meraki.png" height="140"></a>
</p>

<span align="center">

# Homebridge Meraki
[![npm](https://badgen.net/npm/dt/homebridge-meraki-control?color=purple)](https://www.npmjs.com/package/homebridge-meraki-control) [![npm](https://badgen.net/npm/v/homebridge-meraki-control?color=purple)](https://www.npmjs.com/package/homebridge-meraki-control)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-meraki-control.svg)](https://github.com/grzegorz914/homebridge-meraki-control/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-meraki-control.svg)](https://github.com/grzegorz914/homebridge-meraki-control/issues)

Homebridge plugin to control Meraki devices using RESTFull API.

</span>

## Info
1. This plugin control ON/OFF configured WLAN networks in Your organisation(MR devices).
2. More comming soon...

## Package
1. [Homebridge](https://github.com/homebridge/homebridge)
2. [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)

## Installation
1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-meraki-control using: `npm install -g homebridge-meraki-control` or search for `meraki` in Config UI X.

## Configuration
1. Use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to configure the plugin (strongly recomended), or update your configuration file manually. See `sample-config.json` in this repository for a sample or add the bottom example to Your config.json file.
2. In `host` set the baseUrl like `https://n123.meraki.com`, do not use `https://api.meraki.com.`
3. In `apiKey` set the X-Cisco-Meraki-API-Key.
4. In `organizationId` set Your organizationId.
5. In `networkId` set Your networkId.
6. In `wlanControl` set numbers of configured SSIDs in Your network.
7. In `refreshInterval` set the data refresh time in seconds.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-meraki-control"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-meraki-control/master/graphics/ustawienia.png" height="150"></a>
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
                    "wlanControl": 0,
                    "refreshInterval": 10
                }
            ]
        }
```

## Whats new:
https://github.com/grzegorz914/homebridge-meraki-control/blob/master/CHANGELOG.md

## Development
- Pull request and help in development highly appreciated.
