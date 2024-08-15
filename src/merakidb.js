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

        this.impulseGenerator = new ImpulseGenerator();
        this.impulseGenerator.on('updateDashboardClients', async () => {
            const debug = debugLog ? this.emit('debug', `Requesting clients data.`) : false;
            try {
                const dbClientsData = await this.axiosInstance.get(`${dashboardClientsUrl}?perPage=255&timespan=2592000`);
                const debug1 = debugLog ? this.emit('debug', `Clients data: ${JSON.stringify(dbClientsData.data, null, 2)}`) : false;

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
                const debug2 = debugLog ? this.emit('debug', `Found: ${dbClientsCount} clients.`) : false;

                if (dbClientsCount === 0) {
                    return;
                };

                this.impulseGenerator.emit('updateConfiguredAndExistingClients', dbClients);
            } catch (error) {
                this.emit('error', `Requesting clients data error: ${error}, try again in 15s.`);
                await new Promise(resolve => setTimeout(resolve, 15000));
                this.impulseGenerator.emit('updateDashboardClients');
            };
        })
            .on('updateConfiguredAndExistingClients', async (dbClients) => {
                const debug2 = debugLog ? this.emit('debug', `Check configured and activ clients.`) : false;
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
                    const debug3 = debugLog ? this.emit('debug', `Found: ${configuredAndExistedClientsCount} configured and activ clients.`) : false;

                    if (configuredAndExistedClientsCount === 0) {
                        return;
                    };

                    this.impulseGenerator.emit('updateExistedClientsPolicy', configuredAndExistedClients);
                } catch (error) {
                    this.emit('error', `Requestinjg configured clients error: ${error}, try again in 15s.`);
                    await new Promise(resolve => setTimeout(resolve, 15000));
                    this.impulseGenerator.emit('updateDashboardClients');
                };
            })
            .on('updateExistedClientsPolicy', async (configuredAndExistedClients) => {
                const debug = debugLog ? this.emit('debug', `Requesting existed client policy data.`) : false;
                try {
                    const exposedClients = [];
                    for (const client of configuredAndExistedClients) {
                        const clientId = client.id;
                        const clientPolicyData = await this.axiosInstance.get(`${dashboardClientsUrl}/${clientId}/policy`);
                        const debug = debugLog ? this.emit('debug', `Existed client policy data: ${JSON.stringify(clientPolicyData.data, null, 2)}`) : false;
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
                    const debug1 = debugLog ? this.emit('debug', `Found: ${clientsCount} exposed clients.`) : false;

                    if (clientsCount === 0) {
                        return;
                    };

                    //emit device info and state
                    this.emit('deviceInfo', clientsCount);
                    this.emit('deviceState', exposedClients, clientsCount);
                } catch (error) {
                    this.emit('error', `Existed client policy data error: ${error}, try again in 15s.`);
                    await new Promise(resolve => setTimeout(resolve, 15000));
                    this.impulseGenerator.emit('updateDashboardClients');
                };
            }).on('state', (state) => {});

        this.impulseGenerator.emit('updateDashboardClients');
    };

    async send(url, payload) {
        try {
            await this.axiosInstance.put(url, payload);
            return true;;
        } catch (error) {
            this.emit('error', error);
        };
    };
};
module.exports = MerakiDb;
