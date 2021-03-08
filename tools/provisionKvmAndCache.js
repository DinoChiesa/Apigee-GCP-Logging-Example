#! /usr/local/bin/node
/*jslint node:true, esversion:6 */
// provisionKvmAndCache.js
// ------------------------------------------------------------------
// provision the KVMs and cache for the example API proxies that log to
// GCP logging.
//
// Copyright 2017-2020  Google LLC.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// last saved: <2021-March-08 07:32:14>

const fs       = require('fs'),
      apigeejs = require('apigee-edge-js'),
      common   = apigeejs.utility,
      apigee   = apigeejs.edge,
      sprintf  = require('sprintf-js').sprintf,
      Getopt   = require('node-getopt'),
      version  = '20210308-0725',
      defaults = { secretsmap : 'secrets1', settingsmap: 'settings1', cache: 'cache1', logid: 'syslog' },
      getopt   = new Getopt(common.commonOptions.concat([
        ['e' , 'env=ARG', 'required. the Apigee environment for which to store the KVM data'],
        ['Z' , 'secretsmap=ARG', 'optional. name of the KVM in Apigee for keys. Will be created if nec. Default: ' + defaults.secretsmap],
        ['' , 'cache=ARG', 'optional. name of the Cache in Apigee. Will be created if nec. Default: ' + defaults.cache],
        ['S' , 'settingsmap=ARG', 'optional. name of the KVM in Apigee for other non-secret settings. Will be created if nec. Default: ' + defaults.settingsmap],
        ['J' , 'privkeyjson=ARG', 'required. GCP Logging JSON private key file.'],
        ['L' , 'logid=ARG', 'optional. GCP Logging log id for logging. Default: ' + defaults.logid]
      ])).bindHelp();

// ========================================================

console.log(
  'Apigee Edge provisioning tool for KVM + Cache for GCP Logging demo, version: ' + version + '\n' +
    'Node.js ' + process.version + '\n');

common.logWrite('start');

// process.argv array starts with 'node' and 'scriptname.js'
var opt = getopt.parse(process.argv.slice(2));

if ( !opt.options.env ) {
  console.log('You must specify an environment');
  getopt.showHelp();
  process.exit(1);
}
if ( !opt.options.privkeyjson ) {
  console.log('You must specify a JSON file (-J)');
  getopt.showHelp();
  process.exit(1);
}

let privkeyJson = require(opt.options.privkeyjson);

// apply defaults
if ( !opt.options.logid ) {
  common.logWrite(sprintf('defaulting to %s for logid', defaults.logid));
  opt.options.logid = defaults.logid;
}
if ( !opt.options.secretsmap ) {
  common.logWrite(sprintf('defaulting to %s for secrets map', defaults.secretsmap));
  opt.options.secretsmap = defaults.secretsmap;
}
if ( !opt.options.settingsmap ) {
  common.logWrite(sprintf('defaulting to %s for settings map', defaults.settingsmap));
  opt.options.settingsmap = defaults.settingsmap;
}
if ( !opt.options.cache ) {
  common.logWrite(sprintf('defaulting to %s for cache', defaults.cache));
  opt.options.cache = defaults.cache;
}

common.verifyCommonRequiredParameters(opt.options, getopt);

function loadDataIntoMaps(org) {
  // var re = new RegExp('(?:\r\n|\r|\n)', 'g');
  // var pemString = fs.readFileSync(opt.options.privkeypem, 'utf8').replace(re,'\\n');
  let pemString = privkeyJson.private_key;
  let options = {
        env: opt.options.env,
        kvm: opt.options.secretsmap,
        key: 'gcplogging.privKeyPem',
        value: pemString
      };
  common.logWrite(sprintf('loading PEM into %s', opt.options.secretsmap));
  return org.kvms.put(options)
    .then(result => {
      options.kvm = opt.options.settingsmap;
      options.key = 'gcplogging.projectid';
      options.value = privkeyJson.project_id;
      return org.kvms.put(options)
        .then (result => {
          options.key = 'gcplogging.logid';
          options.value = opt.options.logid;
          return org.kvms.put(options)
            .then (result => {
              options.key = 'gcplogging.jwt_issuer';
              options.value = privkeyJson.client_email;
              return org.kvms.put(options);
            });
        });
    });
}


function checkAndCreateCache(org) {
  return org.caches.get({ env: opt.options.env })
    .then( result => {
      if (result.indexOf(opt.options.cache) == -1) {
        return org.caches.create({ env: opt.options.env, name: opt.options.cache});
      }
      return Promise.resolve({});
    });
}

const options = {
      mgmtServer: opt.options.mgmtserver,
      org : opt.options.org,
      user: opt.options.username,
      password: opt.options.password,
      no_token: opt.options.notoken,
      verbosity: opt.options.verbose || 0
    };

apigee.connect(options)
  .then (org => {
    common.logWrite('connected');
    return org.kvms.get({ env: opt.options.env })
    .then(result => {
      const missingMaps = [opt.options.settingsmap, opt.options.secretsmap]
        .filter( value => result.indexOf(value) == -1 )
        .filter( (e, i, c) => c.indexOf(e) === i); // dedupe

      const p = (missingMaps && missingMaps.length > 0) ? ((() => {
            common.logWrite('Need to create one or more maps');
            const r = (p, name) =>
            p.then( a =>
                  org.kvms.create({ env: opt.options.env, name, encrypted:(name == opt.options.secretsmap)})
                  .then( result => [...a, name] ) );

            return missingMaps.reduce(r, Promise.resolve([]));
          })()) : Promise.resolve({});

      return p
        .then( _ => loadDataIntoMaps(org) )
        .then( _ => {
          common.logWrite('ok. the KVMs were loaded successfully.');
          return checkAndCreateCache(org);
        })
        .then ( _ => common.logWrite('ok. the cache exists.') );
    });
  })
  .catch( e => console.error('error: ' + e) );
