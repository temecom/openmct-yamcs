# openmct-yamcs
YAMCS to OpenMCT bridge service

A node service to translate OpenMCT websocket API calls to YAMCS websocket and REST calls in support of the YAMCSTelemetry adapter.
Prerequisits: 
* yamcs service installed and started - http://www.yamcs.org/docs/server/

To install: 

* Clone this repo
* cd openmst-yamcs
* npm install
* npm start

The web socket service will start and listen for requests on ws://localhost:8095. 
