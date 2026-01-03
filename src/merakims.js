import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import { ApiUrls } from './constants.js';

class MerakiMs extends EventEmitter {
    constructor(config) {
        super();
        this.device = config.deviceData;
        this.logDebug = config.logDebug;
        this.firstRun = true;

       this.client = config.client;

        //lock flags
        this.locks = false;
        this.impulseGenerator = new ImpulseGenerator()
            .on('connect', () => this.handleWithLock(async () => {
                await this.connect();
            }))
            .on('state', (state) => {
                this.emit(state ? 'success' : 'warn', `Impulse generator ${state ? 'started' : 'stopped'}`);
            });

    };

    async handleWithLock(fn) {
        if (this.locks) return;

        this.locks = true;
        try {
            await fn();
        } catch (error) {
            this.emit('error', `Inpulse generator error: ${error}`);
        } finally {
            this.locks = false;
        }
    }

    async checkDeviceState(swData) {
        if (this.logDebug) this.emit('debug', `Requesting ports status.`);
        try {
            const ports = [];
            for (const port of swData) {

                //push exposed ports to array
                const obj = {
                    'id': port.portId,
                    'name': port.name ?? `Port ${port.portId}`,
                    'state': port.enabled ?? false,
                    'poeState': port.poeEnabled ?? false
                };
                ports.push(obj);
            };
            const portsCount = ports.length;
            if (this.logDebug) this.emit('debug', `Found: ${portsCount} exposed ports.`);

            if (portsCount === 0) {
                this.emit('warn', `Found: ${portsCount} ports.`);
                return false;
            }

            //emit device info and state
            if (this.firstRun) {
                this.emit('deviceInfo', portsCount);
                this.firstRun = false;
            }
            this.emit('deviceState', ports);

            return true;
        } catch (error) {
            throw new Error(`Requesting port status error: ${error}.`);
        };
    };

    async connect() {
        if (this.logDebug) this.emit('debug', `Requesting data.`);
        try {
            //get data of switch
            const portsUrl = ApiUrls.MsPorts.replace('serialNumber', this.device.serialNumber);
            const swData = await this.client.get(portsUrl);
            if (this.logDebug) this.emit('debug', `Data: ${JSON.stringify(swData.data, null, 2)}`);

            //check device state
            const state = await this.checkDeviceState(swData.data);

            return state;
        } catch (error) {
            throw new Error(`Requesting data error: ${error}`);
        };
    };

    async send(url, payload) {
        try {
            await this.client.put(url, payload);
            return true;
        } catch (error) {
            throw new Error(error);
        };
    };
};
export default MerakiMs;
