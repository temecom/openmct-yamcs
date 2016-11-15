/*****************************************************************************
 * Open MCT, Copyright (c) 2014-2016, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * Administration. All rights reserved.
 *
 * Open MCT is licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Open MCT includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/

/*global require,process,console, http*/

var CONFIG = require("./config.json");
var util = require('util');
(function () {
    "use strict";
    var headers = {
      "Content-Type": "application-json",
      "Accept-Version": "2014-06"
    }
    var httpArgs = {
      "headers": headers
    }
    var WebSocketServer = require('ws').Server,
        fs = require('fs'),
        wss = new WebSocketServer({ port: CONFIG.port }),
        dictionary = {},
        spacecraft = {
            "prop.fuel": 77,
            "prop.thrusters": "OFF",
            "comms.recd": 0,
            "comms.sent": 0,
            "pwr.temp": 245,
            "pwr.c": 8.15,
            "pwr.v": 30
        },
        histories = {},
        listeners = [];
    function findSubSystem(subSystem) {
        return subSystem.name === this;
    }
    function updateSpacecraft() {
        spacecraft["prop.fuel"] = Math.max(
            0,
            spacecraft["prop.fuel"] -
                (spacecraft["prop.thrusters"] === "ON" ? 0.5 : 0)
        );
        spacecraft["pwr.temp"] = spacecraft["pwr.temp"] * 0.985
            + Math.random() * 0.25 + Math.sin(Date.now());
        spacecraft["pwr.c"] = spacecraft["pwr.c"] * 0.985;
        spacecraft["pwr.v"] = 30 + Math.pow(Math.random(), 3);
    }

    function generateTelemetry() {
        var timestamp = Date.now(), sent = 0;
        Object.keys(spacecraft).forEach(function (id) {
            var state = { timestamp: timestamp, value: spacecraft[id] };
            histories[id] = histories[id] || []; // Initialize
            histories[id].push(state);
            spacecraft["comms.sent"] += JSON.stringify(state).length;
        });
        listeners.forEach(function (listener) {
            listener();
        });
    }

    function update() {
        updateSpacecraft();
        generateTelemetry();
    }

    function handleConnection(ws) {
        var subscriptions = {}, // Active subscriptions for this connection
            handlers = {        // Handlers for specific requests
                dictionary: function () {
                    ws.send(JSON.stringify({
                        type: "dictionary",
                        value: dictionary
                    }));
                },
                subscribe: function (id) {
                    subscriptions[id] = true;
                },
                unsubscribe: function (id) {
                    delete subscriptions[id];
                },
                history: function (id) {
                    ws.send(JSON.stringify({
                        type: "history",
                        id: id,
                        value: histories[id]
                    }));
                }
            };

        function notifySubscribers() {
            Object.keys(subscriptions).forEach(function (id) {
                var history = histories[id];
                if (history) {
                    ws.send(JSON.stringify({
                        type: "data",
                        id: id,
                        value: history[history.length - 1]
                    }));
                }
            });
        }

        // Listen for requests
        ws.on('message', function (message) {
            var parts = message.split(' '),
                handler = handlers[parts[0]];
            if (handler) {
                handler.apply(handlers, parts.slice(1));
            }
        });

        // Stop sending telemetry updates for this connection when closed
        ws.on('close', function () {
            listeners = listeners.filter(function (listener) {
                return listener !== notifySubscribers;
            });
        });

        // Notify subscribers when telemetry is updated
        listeners.push(notifySubscribers);
    }

    update();
    setInterval(update, CONFIG.interval);

    wss.on('connection', handleConnection);

    // Connect to YAMCS service

    var instanceQuery = require('request-promise');
    var parameterQuery = require('request-promise');
    instanceQuery(util.format("%s/instances", CONFIG.yamcsBaseUrl))
        .then(function(instances){
            var instance = JSON.parse(instances).instance[0];
            var database = instance.missionDatabase;
            dictionary.name=database.configName;
            dictionary.identifier=database.name || database.configName;
            dictionary.subsystems = [];
            dictionary.instance = instance.name;
            (database.spaceSystem || []).forEach(function(yamcsSubSystem){
                var subSystem = {
                    name: yamcsSubSystem.name,
                    identifier: yamcsSubSystem.qualifiedName || yamcsSubSystem.name,
                    measurements: []
                };

                dictionary.subsystems.push(subSystem);
            });
            return dictionary;
    })
    .then(function(dictionary){
        // Use the instance to do the parameter query
        return parameterQuery(util.format("%s/mdb/%s/parameters", CONFIG.yamcsBaseUrl, dictionary.instance));
    })
    .then(function(results){
        var parameters=JSON.parse(results);
        // Walk down the parameters
        (parameters.parameter || []).forEach(function(parameter){
            var namespace = parameter.qualifiedName.split('/')[1];
            var name = parameter.name;
            var subSystem = dictionary.subsystems.find(findSubSystem, namespace);
            if(subSystem) {
                var measurement = {
                    name: name,
                    identifier: namespace + "." + name
                };
                subSystem.measurements.push(measurement);
            }
        });
    })
    .catch(function(e){
        console.error("Failed to connect with Yamcs service: " + e);
    });

    console.log(util.format("Example yamcs bridge running on port %s", CONFIG.yamcsBaseUrl));

}());