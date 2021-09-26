# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
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