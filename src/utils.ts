'use strict';

export interface PromiseCallbacks {
    [key: string]: {
        resolve: (value?: void | PromiseLike<void>) => void,
        reject: (reason?: any) => void
    }
}
