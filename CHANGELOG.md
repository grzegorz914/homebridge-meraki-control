# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.13.8] - (04.11.2022)
## Changes
- fix TypeError: Cannot read properties of undefined (reading 'updateCharacteristic')

## [0.13.7] - (02.11.2022)
## Changes
- fix status update

## [0.13.5] - (10.09.2022)
## Changes
- reconfigured update and reconnect function
- config schema updated
- increased reconnect time to 15s

## [0.13.4] - (30.08.2022)
## Changes
- fix reading 0 of undefined

## [0.13.0] - (29.08.2022)
## Changes
- added suport to controll more as 1 switch
- cleanup

## [0.12.2] - (29.08.2022)
## Changes
- fix swPortId reference error

## [0.12.0] - (20.08.2022)
## Changes
- added possiblity hide switch ports by port name
- code cleanup
- config schema update

## [0.11.1] - (19.08.2022)
## Changes
- fix ssid hide by name

## [0.11.0] - (19.08.2022)
## Changes
- refactor logs
- added possibility enable debug mode in plugin settings
- added possibility disable log device info on plugin start
- added possiblity hide uplinks ports of switches
- update config schema
- rebuild data refresh and network reconnect if error

## [0.10.23] - (23.07.2022)
## Changes
- refactor information service

## [0.10.21] - (25.04.2022)
## Changes
- update dependencies

## [0.10.20] - (24.04.2022)
## Changes
- update dependencies

## [0.10.18] - (18.01.2022)
## Changes
- update dependencies

## [0.10.17] - (17.01.2022)
## Changes
- update dependencies

## [0.10.16] - (29.12.2021)
- prepare directory and files synchronously

## [0.10.15] - (28.12.2021)
- update node minimum requirements

## [0.10.4] - (26.09.2021)
## Changes
- code cleanup and refactor

## [0.10.3] - (26.09.2021)
## Changes
- config.schema update
- switch ports names display improvements

## [0.10.2] - (26.09.2021)
## Changes
- config.schema update
- readme.md update
- other small fixes

## [0.10.1] - (25.09.2021)
## Changes
- added possibility to disable/enable control for indyvidual switch

## [0.10.0] - (25.09.2021)
## Changes
### WARNING!! - after this update needs to be configured plugin again.
- added switch ports control ON/OFF

## [0.9.1] - (25.09.2021)
## Changes
- added possibility set policy type for configured clients

## [0.9.0] - (25.09.2021)
## Changes
### WARNING!! - after this update needs to be configured Clients again.
- config.schema update
- removed possibility to display clients policy by Meraki Description, please use only MAC Address
- added mode ON/OFF for configured clients 
- code cleanup

## [0.8.21] - (20.09.2021)
## Changes
- config.schema update
- prevent use of empty SSID to be hidden

## [0.8.20] - (19.09.2021)
## Changes
- code cleanup
- fix timeout

## [0.8.17] - (08.09.2021)
## Changes
- bump dependencies
- fixed socket hangup in some sceneri
- revert host properties in config
- stability improvements

## [0.8.16] - (05.09.2021)
## Changes
- bump dependencies

## [0.8.15] - (04.09.2021)
## Changes
- bump dependencies

## [0.8.9] - (30.08.2021)
## Changes
- fixed Client that is not on the network tand exist in plugin  config hrows 404 error.


## [0.8.8] - (29.08.2021)
## Changes
- added ON/OFF function for filtered SSIDs

## [0.8.7] - (29.08.2021)
## Changes
- fixed anomaly of switch policy behaviour

## [0.8.6] - (29.08.2021)
## Changes
- removed host properties from config, no nedded anymore
- code cleanup and some improvements
- update readme

## [0.8.5] - (29.08.2021)
## Changes
- added possibility to chose between Name or Mac Adress for clients to be exposed with its poplicy state.
- added possibility to set custom Name to be exposed for client policy.
- code cleanup

## [0.8.2] - (28.08.2021)
## Changes
- added possibility to expose clients and change its policy.

## [0.8.2] - (27.08.2021)
## Changes
- added possibility to hidden SSIDSs by custom configured name.

## [0.8.0] - (26.08.2021)
## Changes
- added possibility to hidde all unconfigured SSIDs

## [0.6.0] - (23.02.2021)
## Changes
- code rebuild, use Characteristic.onSet, Characteristic.onGet
- require Homebridge 1.3.x or above

## [0.5.9] - (15.02.2021)
## Changes
- added possibility disable log info, options available in config

## [0.5.0] - (04.02.2021)
## Changs
- code rebuild
- automatically detect all possible SSIDs

## [0.4.42] - (01.01.2021)
## Changs
- bump dependiencies

## [0.4.0] - (09.09.2020)
## Changs
- added await/async function

## [0.3.1] - (07.09.2020)
## Changs
- added device info log
- fixed wlan state update

## [0.2.0] - (06.09.2020)
## Changs
- completly reconfigured layout of config schema

## [0.1.11] - (25.08.2020)
### Changes
- performance improvements
- other small fixes

## [0.1.8] - (04.08.2020)
- performance changes

## [0.1.4] - (03.08.2020)
- preparing for future update

## [0.1.3] - (03.08.2020)
- code cleanup

## [0.1.0] - (03.08.2020)
- working version

## [0.0.1] - (02.08.2020)
- initial release (WLAN control)