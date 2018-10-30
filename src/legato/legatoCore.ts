'use strict';

import { LeafProfile } from "../leaf/leafCore";
import { basename } from "path";

export const LEGATO_ENV = {
    LEGATO_ROOT: "LEGATO_ROOT",
    LEGATO_TARGET:"LEGATO_TARGET",
};

export class LegatoEnv {
    public name : string;
    public leafEnv : LeafProfile;
    constructor(env: LeafProfile) {
        this.leafEnv = env;
        this.name = basename(this.leafEnv.getEnvValue(LEGATO_ENV.LEGATO_ROOT));
    }

    public getLegatoTarget():string|undefined {
        if( this.leafEnv ) {
            return this.leafEnv.getEnvValue(LEGATO_ENV.LEGATO_TARGET);
        }
        return undefined;
    }

    public getLegatoRoot():string|undefined {
        if( this.leafEnv ) {
            return this.leafEnv.getEnvValue(LEGATO_ENV.LEGATO_ROOT);
        }
        return undefined;
    }
}