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
                const debug = debugLog ? this.emit('debug', `requesting dashboard clients data.`) : false;
                const clientsData = await this.axiosInstance.get(`${dashboardClientsUrl}?perPage=255&timespan=2592000`);
                const debug1 = debugLog ? this.emit('debug', `dashboard clients data: ${JSON.stringify(clientsData.data, null, 2)}`) : false;

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
                const debug2 = debugLog ? this.emit('debug', `dashboard found: ${clientsPolicyCount} clients policy.`) : false;

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
                const debug3 = debugLog ? this.emit('debug', `dashboard found: ${clientsPolicyCount} exposed and existing clients.`) : false;

                if (exposedAndExistingClientsCount === 0) {
                    return;
                };

                this.emit('updateDashboardClientsPolicy', exposedAndExistingClients);
            } catch (error) {
                this.emit('error', `dashboard client data error: ${error}.`);
                this.refreshData();
            };
        })
            .on('updateDashboardClientsPolicy', async (exposedAndExistingClients) => {
                try {
                    const debug = debugLog ? this.emit('debug', `requesting dashboard clients policy data.`) : false;
                    const exposedClients = [];

                    for (const client of exposedAndExistingClients) {
                        const clientId = client.id;
                        const clientPolicyData = await this.axiosInstance.get(`${dashboardClientsUrl}/${clientId}/policy`);
                        const debug = debugLog ? this.emit('debug', `dashboard client policy data: ${JSON.stringify(clientPolicyData.data, null, 2)}`) : false;
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
                    const debug1 = debugLog ? this.emit('debug', `dashboard found: ${clientsCount} exposed clients.`) : false;

                    if (clientsCount === 0) {
                        return;
                    };

                    const emitDeviceInfo = this.prepareDb ? this.emit('deviceInfo', clientsCount) : false;
                    this.emit('deviceState', exposedClients, clientsCount);
                    this.prepareDb = false;
                    this.refreshData();
                } catch (error) {
                    this.emit('error', `dashboard client policy data error: ${error}.`);
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
