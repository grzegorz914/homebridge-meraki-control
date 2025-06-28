import axios from 'axios';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import { ApiUrls } from './constants.js';

class MerakiDb extends EventEmitter {
    constructor(config) {
        super();
        const host = config.host;
        const apiKey = config.apiKey;
        const networkId = config.networkId;
        this.clientsPolicy = config.deviceData;
        this.enableDebugMode = config.enableDebugMode;

        const baseUrl = (`${host}${ApiUrls.Base}`);
        this.dashboardClientsUrl = ApiUrls.DbClients.replace('networkId', networkId);
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Cisco-Meraki-API-Key': apiKey
            }
        });


        //impulse generator
        this.call = false;
        this.impulseGenerator = new ImpulseGenerator();
        this.impulseGenerator.on('updateDashboardClients', async () => {
            if (this.call) return;

            try {
                this.call = true;
                await this.connect();
                this.call = false;
            } catch (error) {
                this.call = false;
                this.emit('error', `Inpulse generator error: ${error}`);
            };
        }).on('state', (state) => {
            const emitState = state ? this.emit('success', `Impulse generator started.`) : this.emit('warn', `Impulse generator stopped.`);
        });
    };

    async connect() {
        const debug = this.enableDebugMode ? this.emit('debug', `Requesting clients data.`) : false;
        try {
            const dbClientsData = await this.axiosInstance.get(`${this.dashboardClientsUrl}?perPage=255&timespan=2592000`);
            const debug1 = this.enableDebugMode ? this.emit('debug', `Clients data: ${JSON.stringify(dbClientsData.data, null, 2)}`) : false;

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
            const debug2 = this.enableDebugMode ? this.emit('debug', `Found: ${dbClientsCount} clients.`) : false;

            if (dbClientsCount === 0) {
                return false;
            };
            const state = await this.updateConfiguredAndExistingClients(dbClients);

            return state;
        } catch (error) {
            throw new Error(`Requesting clients data error: ${error}`);
        };
    };

    async updateConfiguredAndExistingClients(dbClients) {
        const debug = this.enableDebugMode ? this.emit('debug', `Check configured and activ clients.`) : false;
        try {
            //create exposed clientsPolicy
            const configuredAndExistedClients = [];
            for (const clientPolicy of this.clientsPolicy) {
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
            const debug1 = this.enableDebugMode ? this.emit('debug', `Found: ${configuredAndExistedClientsCount} configured and activ clients.`) : false;

            if (configuredAndExistedClientsCount === 0) {
                this.emit('warn', `Found: ${configuredAndExistedClientsCount} configured and activ clients.`);
                return false;
            };
            const state = await this.updateExistedClientsPolicy(configuredAndExistedClients);

            return state;
        } catch (error) {
            throw new Error(`Requestinjg configured clients error: ${error}`);
        };
    };

    async updateExistedClientsPolicy(configuredAndExistedClients) {
        const debug = this.enableDebugMode ? this.emit('debug', `Requesting existed client policy data.`) : false;
        try {
            const exposedClients = [];
            for (const client of configuredAndExistedClients) {
                const clientId = client.id;
                const clientPolicyData = await this.axiosInstance.get(`${this.dashboardClientsUrl}/${clientId}/policy`);
                const debug1 = this.enableDebugMode ? this.emit('debug', `Existed client policy data: ${JSON.stringify(clientPolicyData.data, null, 2)}`) : false;
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
            const debug2 = this.enableDebugMode ? this.emit('debug', `Found: ${clientsCount} exposed clients.`) : false;

            if (clientsCount === 0) {
                this.emit('warn', `Found: ${clientsCount} exposed clients.`);
                return false;
            };

            //emit device info and state
            this.emit('deviceInfo', clientsCount);
            this.emit('deviceState', exposedClients, clientsCount);

            return true;
        } catch (error) {
            throw new Error(`Existed client policy data error: ${error}`);
        };
    };

    async send(url, payload) {
        try {
            await this.axiosInstance.put(url, payload);
            return true;
        } catch (error) {
            throw new Error(error);
        };
    };
};
export default MerakiDb;
