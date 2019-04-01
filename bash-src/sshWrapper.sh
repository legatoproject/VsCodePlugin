#!/bin/bash
set -u # Fail fast
REMOTE_PORT="$1"
shift
LOCAL_PORT="$1"
shift
GDBSERVER_PATH="$1"
shift
DEVICE_IP="$1"
shift
ssh -L ${REMOTE_PORT}:localhost:${LOCAL_PORT} root@${DEVICE_IP} "${GDBSERVER_PATH} :${REMOTE_PORT} $@"
