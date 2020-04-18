import {
    HomebridgeApi,
    HomebridgeLogging,
    HomebridgePlatform,
    HomebridgePlatformAccessory,
    IPlatformConfig,
} from 'homebridge-ts-helper';
import {filter, take, tap} from 'rxjs/operators';
import * as uuidFunctions from 'hap-nodejs/dist/lib/util/uuid';
import {componentHelpers} from './homebridgeAccessories/componentHelpers';
import {EspDevice} from 'esphome-ts/dist';

const PLUGIN_NAME = 'homebridge-esphome-ts';
const PLATFORM_NAME = 'esphome';

let Accessory: HomebridgePlatformAccessory;
let UUIDGen: typeof uuidFunctions;

export default (homebridge: HomebridgeApi) => {

    // Accessory must be created from PlatformAccessory Constructor
    Accessory = homebridge.platformAccessory;

    // Service and Characteristic are from hap-nodejs
    UUIDGen = homebridge.hap.uuid;


    // For platform plugin to be considered as dynamic platform plugin,
    // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
    homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, EsphomePlatform, true);
};

interface IEsphomePlatformConfig extends IPlatformConfig {
    devices: {
        host: string;
        password?: string;
        port?: number;
    }[],
    blacklist?: string[];
    debug?: boolean;
}

export class EsphomePlatform extends HomebridgePlatform {

    protected readonly espDevices: EspDevice[] = [];

    protected readonly blacklistSet: Set<string>;

    constructor(protected readonly log: HomebridgeLogging,
                protected readonly config: IEsphomePlatformConfig,
                protected readonly api: HomebridgeApi) {
        super(log, config, api);
        this.log('starting esphome');
        this.blacklistSet = new Set<string>(this.config.blacklist ?? []);
    }

    protected onHomebridgeDidFinishLaunching(): void {
        this.config.devices.forEach((deviceConfig) => {
            const device = new EspDevice(deviceConfig.host, deviceConfig.password, deviceConfig.port);
            device.discovery$.pipe(
                filter(((value: boolean) => value)),
                take(1),
                tap(() => {
                    this.addAccessories(device);
                }),
            ).subscribe();
            this.espDevices.push(device);
        });
    }

    private addAccessories(device: EspDevice): void {
        for (const key of Object.keys(device.components)) {
            const component = device.components[key];
            const componentHelper = componentHelpers.get(component.getType);
            if (!componentHelper) {
                this.log(`${component.name} is currently not supported. You might want to file an issue on Github.`)
                continue;
            }
            const uuid = UUIDGen.generate(component.name);
            let newAccessory = false;
            let accessory: HomebridgePlatformAccessory | undefined = this.accessories.find(
                (accessory) => accessory.UUID === uuid);
            if (!accessory) {
                accessory = new Accessory(component.name, uuid);
                newAccessory = true;
            }
            componentHelper(component, accessory);
            accessory.reachable = true;
            this.log(`${component.name} discovered and setup.`)
            if (accessory && newAccessory && !this.blacklistSet.has(component.name)) {
                this.accessories.push(accessory);
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        }

        if (this.config.debug) {
            this.log('Raw Discovered Components', device.components);
        }
    }

    configureAccessory(accessory: HomebridgePlatformAccessory): void {
        accessory.reachable = false;
        this.accessories.push(accessory);
    }
}
