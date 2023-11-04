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
            const debug = debugLog ? this.emit('debug', `requesting dashboard clients data.`) : false;
            try {
                const clientsData = await this.axiosInstance.get(`${dashboardClientsUrl}?perPage=255&timespan=2592000`);
                const debug = debugLog ? this.emit('debug', `dashboard clients data: ${JSON.stringify(clientsData.data, null, 2)}`) : false;

                const clientsId = [];
                const clientsMac = [];
                const clientsDescription = [];

                for (const client of clientsData.data) {
                    const clientId = client.id;
                    const clientMac = (client.mac).split(':').join('');
                    const clientDescription = client.description;

                    clientsId.push(clientId);
                    clientsMac.push(clientMac);
                    clientsDescription.push(clientDescription);
                }

                //exposed existings and configured clients
                const clientsPolicyCount = clientsPolicy.length;
                const debug1 = debugLog ? this.emit('debug', `found clients policy count: ${clientsPolicyCount}`) : false;

                if (clientsPolicyCount === 0) {
                    return;
                };

                const exposedAndExistingClients = [];
                for (const clientPolicy of clientsPolicy) {
                    const clientName = clientPolicy.name;
                    const clientMac = (clientPolicy.mac).split(':').join('');
                    const clientPolicyType = clientPolicy.type;
                    const clientEnabled = clientPolicy.mode;

                    const clientIndex = clientEnabled ? clientsMac.indexOf(clientMac) : -1;
                    const clientId = clientIndex !== -1 ? clientsId[clientIndex] : -1;

                    const exposedClient = {
                        "name": clientName,
                        "mac": clientMac,
                        "type": clientPolicyType,
                        "id": clientId
                    }

                    //check and push existed clients
                    const exposeClient = (clientId !== -1);
                    const pushExposedAndExistingClient = exposeClient ? exposedAndExistingClients.push(exposedClient) : false;
                };

                const exposedAndExistingClientsCount = exposedAndExistingClients.length;
                const debug2 = debugLog ? this.emit('debug', `found exposed and existing clients count: ${clientsPolicyCount}`) : false;

                if (exposedAndExistingClientsCount === 0) {
                    return;
                };

                this.emit('updateDashboardClientsPolicy', exposedAndExistingClients);
            } catch (error) {
                this.emit('error', `dashboard client data error: ${error}.`);
                this.updateDashboardClients();
            };
        })
            .on('updateDashboardClientsPolicy', async (exposedAndExistingClients) => {
                const debug = debugLog ? this.emit('debug', `requesting dashboard clients policy data.`) : false;
                try {
                    const confClientsPolicyName = [];
                    const confClientsPolicyType = [];

                    const clientsPolicyId = [];
                    const clientsPolicyMac = [];
                    const clientsPolicyPolicy = [];
                    const clientsPolicyState = [];

                    for (const client of exposedAndExistingClients) {
                        const clientId = client.id;
                        const clientPolicyData = await this.axiosInstance.get(`${dashboardClientsUrl}/${clientId}/policy`);
                        const debug = debugLog ? this.emit('debug', `dashboard client policy data: ${JSON.stringify(clientPolicyData.data, null, 2)}`) : false;

                        const confClientName = client.name;
                        const confClientPolicyType = client.type;
                        const clientPolicyMac = clientPolicyData.data.mac;
                        const clientPolicyPolicy = clientPolicyData.data.devicePolicy ?? 'undefined';
                        const clientPolicyState = clientPolicyPolicy !== 'Blocked' ?? false;

                        confClientsPolicyName.push(confClientName);
                        confClientsPolicyType.push(confClientPolicyType);
                        clientsPolicyId.push(clientId);
                        clientsPolicyMac.push(clientPolicyMac);
                        clientsPolicyPolicy.push(clientPolicyPolicy);
                        clientsPolicyState.push(clientPolicyState);
                    };

                    //configured clients policy
                    const clientsCount = clientsPolicyState.length;
                    const debug = debugLog ? this.emit('debug', `found dashboard clients count: ${clientsCount}`) : false;

                    if (clientsCount === 0) {
                        return;
                    };

                    this.emit('deviceInfo', clientsCount);
                    this.emit('deviceState', confClientsPolicyName, confClientsPolicyType, clientsPolicyId, clientsPolicyMac, clientsPolicyPolicy, clientsPolicyState, clientsCount);
                    this.updateDashboardClients();
                } catch (error) {
                    this.emit('error', `dashboard client policy data error: ${error}.`);
                    this.updateDashboardClients();
                };
            });

        this.emit('updateDashboardClients');
    };

    async updateDashboardClients() {
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
