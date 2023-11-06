'use strict';
const https = require('https');
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');

class MerakiDb extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const apiKey = config.apiKey;
        const networkId = config.networkId;
        const clientsPolicy = config.clientsPolicy;
        const debugLog = config.debugLog;
        this.refreshInterval = config.refreshInterval;
        this.prepareDb = true;

        const baseUrl = (`${host}${CONSTANS.ApiUrls.Base}`);
        const dashboardClientsUrl = CONSTANS.ApiUrls.DbClients.replace('networkId', networkId);
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Cisco-Meraki-API-Key': apiKey
            },
            withCredentials: true,
            httpsAgent: new https.Agent({
                keepAlive: true,
                rejectUnauthorized: false
            })
        });

        this.on('updateDashboardClients', async () => {
            try {
                const debug = debugLog ? this.emit('debug', `requesting clients data.`) : false;
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

                this.emit('updateConfiguredAndExistingClients', dbClients);
            } catch (error) {
                this.emit('error', `clients data error: ${error}.`);
                this.refreshData();
            };
        })
            .on('updateConfiguredAndExistingClients', (dbClients) => {
                try {
                    const debug = debugLog ? this.emit('debug', `requesting configured clients.`) : false;

                    //configured clients policy
                    const configuredClientsPolicy = clientsPolicy;
                    const cconfiguredCientsPolicyCount = clientsPolicy.length;
                    const debug1 = debugLog ? this.emit('debug', `found: ${cconfiguredCientsPolicyCount} configured clients.`) : false;

                    if (cconfiguredCientsPolicyCount === 0) {
                        return;
                    };

                    const debug2 = debugLog ? this.emit('debug', `check configured and activ clients.`) : false;
                    //create exposed clientsPolicy
                    const configuredAndExistedClients = [];
                    for (const configuredClientPolicy of configuredClientsPolicy) {
                        const name = configuredClientPolicy.name;
                        const mac = (configuredClientPolicy.mac).split(':').join('');
                        const policyType = configuredClientPolicy.type;
                        const state = configuredClientPolicy.mode; //activ - not activ

                        //check if configured client exist in dashboard
                        const index = dbClients.findIndex(item => item.id === mac);
                        const id = index !== -1 ? dbClients[index].id : -1;

                        const obj = {
                            "name": name,
                            "mac": mac,
                            "type": policyType,
                            "id": id
                        }

                        //check and push existed clients
                        const push = index !== -1 ? configuredAndExistedClients.push(obj) : false;
                    };

                    const configuredAndExistedClientsCount = configuredAndExistedClients.length;
                    const debug3 = debugLog ? this.emit('debug', `found: ${configuredAndExistedClientsCount} configured and activ clients.`) : false;

                    if (configuredAndExistedClientsCount === 0) {
                        return;
                    };

                    this.emit('updateExistedClientsPolicy', configuredAndExistedClients);
                } catch (error) {
                    this.emit('error', `configured clients error: ${error}.`);
                    this.refreshData();
                };
            })
            .on('updateExistedClientsPolicy', async (configuredAndExistedClients) => {
                try {
                    const debug = debugLog ? this.emit('debug', `requesting existed client policy data.`) : false;
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

                    const emitDeviceInfo = this.prepareDb ? this.emit('deviceInfo', clientsCount) : false;
                    this.emit('deviceState', exposedClients, clientsCount);
                    this.prepareDb = false;
                    this.refreshData();
                } catch (error) {
                    this.emit('error', `existed client policy data error: ${error}.`);
                    this.refreshData();
                };
            });

        this.emit('updateDashboardClients');
    };

    async refreshData() {
        await new Promise(resolve => setTimeout(resolve, this.refreshInterval * 1000));
        this.emit('updateDashboardClients');
    };

    send(url, payload) {
        return new Promise(async (resolve, reject) => {
            try {
                await this.axiosInstance.put(url, payload);
                await new Promise(resolve => setTimeout(resolve, 750));
                resolve();
            } catch (error) {
                reject(error);
            };
        });
    };
};
module.exports = MerakiDb;
