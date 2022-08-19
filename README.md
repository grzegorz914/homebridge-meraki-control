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
| [Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Web User Interface | Recommended |
| [Meraki Control](https://www.npmjs.com/package/homebridge-meraki-control) | `npm install -g homebridge-meraki-control` | Plug-In | Required |
## Note
* Versin 0.6.0 and above need to be used with Homebridge min. v1.3.x.

## Know Issues
* If use with Hoobs possible config incompatibilty.

## Troubleshooting
* If for some reason the device is not displayed in HomeKit app try this procedure:
   * Go to `./homebridge/persist` for macOS or `/var/lib/homebridge/persist` for RPI.
   * Remove `AccessoryInfo.xxx` file which contain Your device data: `{"displayName":"Meraki"}`.
   * Next remove `IdentifierCashe.xxx` file with same name as `AccessoryInfo.xxx`.
   * Restart Homebridge and try add it to the Home app again.

## Features and How To Use Them
* Switch `ON/OFF SSIDs networks` in Your organisation (MR devices).
* Hide `Unconfigured SSIDs` networks, available in plugin settings.
* Hide `SSIDs networks` filtered by network *Name*, available in plugin settings.
* Expose `Clients` filtered by *Mac Address* and apply policy `Normal, Whitelisted, Group Policy` / `Blocked`.
* Switch `ON/OFF Ports` on switch, available in plugin settings, right now only one switch is supported.
* Siri can be used to switch ON/OFF SSID, Policy, Port.
* Home automations and shortcuts can be used for all functions.
* More comming soon...

## Configuration
* Run this plugin as a child bridge (Highly Recommended).
* Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) to configure this plugin (Highly Recommended). 
* The sample configuration can be edited and used manually as an alternative. See the `sample-config.json` file in this repository for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.

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
| `dashboardClientsPolicy.mode` | Here set the mode *ON/OFF* for this Client. |
| `accessPointsControl` | This option *Enable/Disable* control of Access Points. |
| `hideUnconfiguredSsids` | If enabled, all *Unconfigured SSIDs* will be hidden and not exposed to the *Homebridge/HomeKit*. |
| `hideSsids.name` | Here set *SSID Name* which You want hide and not expose to the *Homebridge/HomeKit*. |
| `hideSsids.mode` | Here set mode *ON/OFF* for this SSID. |
| `switchesControl` | This option *Enable/Disable* control of Switches. |
| `switchesHideUplinkPorts` | If enabled, all *Uplink* ports will be hidden and not exposed to the *Homebridge/HomeKit*. |
| `switches.name` | Here set the *Name* for this Switch. |
| `switches.serialNumber` | Here set the *Serial Number* for this Switch. |
| `switches.mode` | Here set mode *ON/OFF* for this Port. |

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
                     "switchesHideUplinkPorts": false,
                     "switches": [{
                         "name": "Switch Name",
                         "serialNumber": "O1H1-GL5D-AXXX",
                         "mode": false
                     }]
                }
            ]
        }
```

### Adding to HomeKit
Each accessory needs to be manually paired. 
1. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' width='16.42px'> app on your device. 
2. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' width='16.42px'>. 
3. Tap *Add Accessory*, and select *I Don't Have a Code, Cannot Scan* or *More options*. 
4. Select Your accessory and press add anyway. 
5. Enter the PIN or scan the QR code, this can be found in Homebridge UI or Homebridge logs.
6. Complete the accessory setup.

## Limitations
* That maximum Services for 1 accessory is 100. If Services > 100, accessory stop responding.
* The Services in this accessory are:
  * Information.
  * SSIDs.
  * Clients.
  * Switch Ports.

## [What's New](https://github.com/grzegorz914/homebridge-meraki-control/blob/main/CHANGELOG.md)

## Development
- Pull request and help in development highly appreciated.
