#! /usr/local/bin/node
/*jslint node:true, esversion:6 */
// createKvm.js
// ------------------------------------------------------------------
// create the KVM for the example API proxy that logs to
// GCP logging.
//
// Copyright 2017-2021  Google LLC.
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
// last saved: <2021-August-03 17:34:48>

const apigeejs = require('apigee-edge-js'),
      common   = apigeejs.utility,
      apigee   = apigeejs.edge,
      Getopt   = require('node-getopt'),
      version  = '20210803-1716',
      defaults = { secretsmap : 'secrets1'  },
      getopt   = new Getopt(common.commonOptions.concat([
        ['e' , 'env=ARG', 'required. the Apigee environment for which to store the KVM data'],
        ['' , 'secretsmap=ARG', 'optional. name of the KVM in Apigee for keys. Will be created if nec. Default: ' + defaults.secretsmap]
      ])).bindHelp();

// ========================================================

process.on('unhandledRejection',
            r => console.log('\n*** unhandled promise rejection: ' + util.format(r)));

// process.argv array starts with 'node' and 'scriptname.js'
let opt = getopt.parse(process.argv.slice(2));

if (opt.options.verbose) {
  console.log(
  `Apigee provisioning tool for GCP Logging demo, version: ${version}\n`);

  common.logWrite('start');
}

if ( !opt.options.env ) {
  console.log('You must specify an environment');
  getopt.showHelp();
  process.exit(1);
}

// apply defaults
if ( !opt.options.secretsmap ) {
  common.logWrite(`defaulting to ${defaults.secretsmap} for secrets map`);
  opt.options.secretsmap = defaults.secretsmap;
}

common.verifyCommonRequiredParameters(opt.options, getopt);

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
      .then(existingMaps => {
        const foundmap = existingMaps.find( name => name == opt.options.secretsmap);

        if (foundmap) {
          return common.logWrite('ok. the KVM exists.');
        }
        return org.kvms.create({ env: opt.options.env, name:opt.options.secretsmap, encrypted:true})
          .then( _ => common.logWrite('ok. the KVM was created successfully.'));
      });
  })
  .catch( e => console.error('error: ' + e) );
