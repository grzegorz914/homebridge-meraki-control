'use strict';
const axios = require('axios');
const EventEmitter = require('events');
const CONSTANS = require('./constans.json');

class MerakiDb extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const apiKey = config.apiKey;
        const networkId = config.networkId;
        const confClients = config.confClients;
        const debugLog = config.debugLog;
        this.refreshInterval = config.refreshInterval;
        const confClientsCount = confClients.length;

        const baseUrl = (`${host}${CONSTANS.ApiUrls.BaseUrl}`);
        const dashboardClientsUrl = `/networks/${networkId}/clients`;
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Cisco-Meraki-API-Key': apiKey
            }
        });

        this.on('updateDashboardClients', async () => {
            const debug = debugLog ? this.emit('debug', `requesting dashboard clients data.`) : false;
            try {
                const dbClientsData = await this.axiosInstance.get(`${dashboardClientsUrl}?perPage=255&timespan=2592000`);
                const debug = debugLog ? this.emit('debug', `Debug dashboard clients data: ${JSON.stringify(dbClientsData.data, null, 2)}`) : false;

                if (dbClientsData.status !== 200) {
                    this.emit('message', `Update dashboard clients data status: ${dbClientsData.status}.`);
                    return;
                }

                const dbClientsId = [];
                const dbClientsMac = [];
                const dbClientsDescription = [];

                for (const client of dbClientsData.data) {
                    const clientId = client.id;
                    const clientMac = (client.mac).split(':').join('');
                    const clientDescription = client.description;

                    dbClientsId.push(clientId);
                    dbClientsMac.push(clientMac);
                    dbClientsDescription.push(clientDescription);
                }

                //configured clients
                if (confClientsCount === 0) {
                    return;
                };

                const dbExposedAndExistingClientsName = [];
                const dbExposedAndExistingClientsId = [];
                const dbExposedAndExistingClientsMac = [];
                const dbExposedAndExistingClientsPolicy = [];

                for (const client of confClients) {
                    const clientName = client.name;
                    const clientMac = (client.mac).split(':').join('');
                    const clientPolicyType = client.type;
                    const clientEnabled = client.mode;

                    const clientIndex = clientEnabled ? dbClientsMac.indexOf(clientMac) : -1;
                    const clientId = clientIndex !== -1 ? dbClientsId[clientIndex] : -1;

                    //check and push existed clients in dshboard
                    const exposeClient = (clientId !== -1);
                    const pushExposedAndExistingClientName = exposeClient ? dbExposedAndExistingClientsName.push(clientName) : false;
                    const pushExposedAndExistongClientId = exposeClient ? dbExposedAndExistingClientsId.push(clientId) : false;
                    const pushExposedAndExistongClientMac = exposeClient ? dbExposedAndExistingClientsMac.push(clientMac) : false;
                    const pushExposedAndExistongClientPolicy = exposeClient ? dbExposedAndExistingClientsPolicy.push(clientPolicyType) : false;
                };

                const dbExposedAndExistingClientsCount = dbExposedAndExistingClientsId.length;
                if (dbExposedAndExistingClientsCount === 0) {
                    return;
                };

                this.emit('updateDashboardClientsPolicy', dbExposedAndExistingClientsName, dbExposedAndExistingClientsId, dbExposedAndExistingClientsCount);
            } catch (error) {
                this.emit('error', `dashboard client data error: ${error}.`);
                this.updateDashboardClients()
            };
        })
            .on('updateDashboardClientsPolicy', async (clientsName, clientsId, exposedClientsCount) => {
                const debug = debugLog ? this.emit('debug', `requesting dashboard clients policy data.`) : false;
                try {
                    const clientsPolicyName = [];
                    const clientsPolicyId = [];
                    const clientsPolicyMac = [];
                    const clientsPolicyPolicy = [];
                    const clientsPolicyState = [];

                    for (let i = 0; i < exposedClientsCount; i++) {
                        const clientId = clientsId[i];
                        const clientPolicyData = await this.axiosInstance.get(`${dashboardClientsUrl}/${clientId}/policy`);
                        const debug = debugLog ? this.emit('debug', `Debug dashboard client policy data: ${JSON.stringify(clientPolicyData.data[0], null, 2)}`) : false;

                        if (clientPolicyData.status !== 200) {
                            this.emit('message', `Update dashboard client policy data status: ${clientPolicyData.status}.`);
                            return;
                        }
                        const clientPolicyName = clientsName[i];
                        const clientPolicId = clientsId[i];
                        const clientPolicyMac = clientPolicyData.data.mac;
                        const clientPolicyPolicy = clientPolicyData.data.devicePolicy ?? 'undefined';
                        const clientPolicyState = clientPolicyPolicy !== 'Blocked' ?? false;

                        clientsPolicyName.push(clientPolicyName);
                        clientsPolicyId.push(clientPolicId);
                        clientsPolicyMac.push(clientPolicyMac);
                        clientsPolicyPolicy.push(clientPolicyPolicy);
                        clientsPolicyState.push(clientPolicyState);
                    };

                    const clientsCount = clientsPolicyState.length;
                    this.emit('data', clientsPolicyName, clientsPolicyId, clientsPolicyMac, clientsPolicyPolicy, clientsPolicyState, clientsCount);
                    this.updateDashboardClients();
                } catch (error) {
                    this.emit('error', `dashboard client policy data error: ${error}.`);
                    this.updateDashboardClients()
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
