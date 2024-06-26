'use strict';
const axios = require('axios');
const EventEmitter = require('events');
const ImpulseGenerator = require('./impulsegenerator.js');
const CONSTANTS = require('./constants.json');

class MerakiDb extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const apiKey = config.apiKey;
        const networkId = config.networkId;
        const clientsPolicy = config.deviceData;
        const debugLog = config.debugLog;
        const refreshInterval = config.refreshInterval;

        const baseUrl = (`${host}${CONSTANTS.ApiUrls.Base}`);
        const dashboardClientsUrl = CONSTANTS.ApiUrls.DbClients.replace('networkId', networkId);
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Cisco-Meraki-API-Key': apiKey
            }
        });

        const timers = [
            { name: 'updateDashboardClients', interval: refreshInterval }
        ];

        const impulseGenerator = new ImpulseGenerator(timers);
        impulseGenerator.on('updateDashboardClients', async () => {
            const debug = debugLog ? this.emit('debug', `requesting clients data.`) : false;
            try {
                const dbClientsData = await this.axiosInstance.get(`${dashboardClientsUrl}?perPage=255&timespan=2592000`);
                const debug1 = debugLog ? this.emit('debug', `clients data: ${JSON.stringify(dbClientsData.data, null, 2)}`) : false;

                const dbClients = [];
                for (const dbClient of dbClientsData.data) {
                    const id = dbClient.id;
                    const mac = (dbClient.mac).split(':').join('');
                    const description = dbClient.description;

                    const obj = {
                        "id": id,
                        "mac": mac,
                        "description": description
                    }
                    dbClients.push(obj);
                }

                //exposed existings and configured clients
                const dbClientsCount = dbClients.length;
                const debug2 = debugLog ? this.emit('debug', `found: ${dbClientsCount} clients.`) : false;

                if (dbClientsCount === 0) {
                    return;
                };

                impulseGenerator.emit('updateConfiguredAndExistingClients', dbClients);
            } catch (error) {
                this.emit('error', `requesting clients data error: ${error}.`);
            };
        })
            .on('updateConfiguredAndExistingClients', (dbClients) => {
                const debug2 = debugLog ? this.emit('debug', `check configured and activ clients.`) : false;
                try {
                    //create exposed clientsPolicy
                    const configuredAndExistedClients = [];
                    for (const clientPolicy of clientsPolicy) {
                        const mac = (clientPolicy.mac).split(':').join('');

                        //check if configured client exist in dashboard
                        const index = dbClients.findIndex(item => item.id === mac);
                        const id = index !== -1 ? dbClients[index].id : -1;

                        //push existed clients
                        if (index !== -1) {
                            const obj = {
                                "name": clientPolicy.name,
                                "mac": clientPolicy.mac,
                                "type": clientPolicy.type,
                                "id": id
                            }
                            configuredAndExistedClients.push(obj);
                        };
                    };

                    const configuredAndExistedClientsCount = configuredAndExistedClients.length;
                    const debug3 = debugLog ? this.emit('debug', `found: ${configuredAndExistedClientsCount} configured and activ clients.`) : false;

                    if (configuredAndExistedClientsCount === 0) {
                        return;
                    };

                    impulseGenerator.emit('updateExistedClientsPolicy', configuredAndExistedClients);
                } catch (error) {
                    this.emit('error', `requestinjg configured clients error: ${error}.`);
                };
            })
            .on('updateExistedClientsPolicy', async (configuredAndExistedClients) => {
                const debug = debugLog ? this.emit('debug', `requesting existed client policy data.`) : false;
                try {
                    const exposedClients = [];
                    for (const client of configuredAndExistedClients) {
                        const clientId = client.id;
                        const clientPolicyData = await this.axiosInstance.get(`${dashboardClientsUrl}/${clientId}/policy`);
                        const debug = debugLog ? this.emit('debug', `existed client policy data: ${JSON.stringify(clientPolicyData.data, null, 2)}`) : false;
                        const clientPolicyMac = clientPolicyData.data.mac;
                        const clientPolicyPolicy = clientPolicyData.data.devicePolicy ?? 'undefined';
                        const clientPolicyState = clientPolicyPolicy !== 'Blocked' ?? false;

                        //push exposed clients to array
                        const obj = {
                            'id': clientId,
                            'name': client.name,
                            'policyType': client.type,
                            'mac': clientPolicyMac,
                            'policy': clientPolicyPolicy,
                            'policyState': clientPolicyState
                        };
                        exposedClients.push(obj);
                    };

                    //configured clients policy
                    const clientsCount = exposedClients.length;
                    const debug1 = debugLog ? this.emit('debug', `found: ${clientsCount} exposed clients.`) : false;

                    if (clientsCount === 0) {
                        return;
                    };

                    //emit device info and state
                    this.emit('deviceInfo', clientsCount);
                    this.emit('deviceState', exposedClients, clientsCount);
                } catch (error) {
                    this.emit('error', `existed client policy data error: ${error}.`);
                };
            });

        impulseGenerator.start();
    };

    send(url, payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.axiosInstance.put(url, payload);
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MerakiDb;
