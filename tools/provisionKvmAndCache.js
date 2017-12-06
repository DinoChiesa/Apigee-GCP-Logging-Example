#! /usr/local/bin/node
/*jslint node:true */
// provisionKvmAndCache.js
// ------------------------------------------------------------------
// provision the KVMs and cache for the example API proxies that log to
// stackdriver.
//
// last saved: <2017-December-06 12:34:26>

var fs = require('fs'),
    edgejs = require('apigee-edge-js'),
    common = edgejs.utility,
    apigeeEdge = edgejs.edge,
    sprintf = require('sprintf-js').sprintf,
    Getopt = require('node-getopt'),
    async = require('async'),
    version = '20171115-1842',
    stackdriverJson,
    defaults = { secretsmap : 'secrets1', settingsmap: 'settings1', cache: 'cache1', logid: 'syslog' },
    getopt = new Getopt(common.commonOptions.concat([
      ['e' , 'env=ARG', 'required. the Edge environment for which to store the KVM data'],
      ['Z' , 'secretsmap=ARG', 'optional. name of the KVM in Edge for keys. Will be created if nec. Default: ' + defaults.secretsmap],
      ['C' , 'cache=ARG', 'optional. name of the Cache in Edge. Will be created if nec. Default: ' + defaults.cache],
      ['S' , 'settingsmap=ARG', 'optional. name of the KVM in Edge for other non-secret settings. Will be created if nec. Default: ' + defaults.settingsmap],
      ['J' , 'privkeyjson=ARG', 'required. stackdriver JSON private key file.'],
      ['L' , 'logid=ARG', 'optional. stackdriver log id for logging. Default: ' + defaults.logid],
      ['N' , 'notoken', 'optional. do not try to get a authentication token.']
    ])).bindHelp();

// ========================================================

console.log(
  'Apigee Edge provisioning tool for KVM + Cache for Stackdriver demo, version: ' + version + '\n' +
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

stackdriverJson = require(opt.options.privkeyjson);

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

function loadDataIntoMaps(org, cb) {
  // var re = new RegExp('(?:\r\n|\r|\n)', 'g');
  // var pemString = fs.readFileSync(opt.options.privkeypem, 'utf8').replace(re,'\\n');
  var pemString = stackdriverJson.private_key;
  var options = {
        env: opt.options.env,
        kvm: opt.options.secretsmap,
        key: 'stackdriver.privKeyPem',
        value: pemString
      };
  common.logWrite(sprintf('loading PEM into %s', opt.options.secretsmap));
  org.kvms.put(options, function(e, result){
    if (e) return cb(e, result);
    options.kvm = opt.options.settingsmap;
    options.key = 'stackdriver.projectid';
    options.value = stackdriverJson.project_id;
    org.kvms.put(options, function(e, result){
      if (e) return cb(e, result);
      options.key = 'stackdriver.logid';
      options.value = opt.options.logid;
      org.kvms.put(options, function(e, result){
        if (e) return cb(e, result);
        options.key = 'stackdriver.jwt_issuer';
        options.value = stackdriverJson.client_email;
        org.kvms.put(options, function(e, result){
          if (e) return cb(e, result);
          cb(null, result);
        });
      });
    });
  });
}



function kvmsLoadedCb(org) {
  return function(e, result) {
    if (e) {
    common.logWrite(JSON.stringify(e, null, 2));
      console.log(e.stack);
      process.exit(1);
    }
    common.logWrite('ok. the KVMs were loaded successfully.');
    checkAndCreateCache(org, function(e, result){
      if (e) {
    common.logWrite(JSON.stringify(e, null, 2));
        console.log(e.stack);
        process.exit(1);
      }
      common.logWrite('ok. the cache exists.');
    });
  };
}


function checkAndCreateCache(org, cb) {
  org.caches.get({ env: opt.options.env }, function(e, result){
    if (e) {
      common.logWrite(JSON.stringify(e, null, 2));
      console.log(e.stack);
      process.exit(1);
    }
    if (result.indexOf(opt.options.cache) == -1) {
      org.caches.create({ env: opt.options.env, name: opt.options.cache},
                        function(e, result){
                          if (e) return cb(e);
                          cb(null, opt.options.cache);
                        });
    }
    else {
      return cb(null, opt.options.cache);
    }
  });
}

function createOneKvm(org) {
  return function (mapname, cb) {
    // create KVM.  Use encrypted if it is for secrets.
    org.kvms.create({ env: opt.options.env, name: mapname, encrypted:(mapname == opt.options.secretsmap)},
                    function(e, result){
                      if (e) return cb(e);
                      cb(null, mapname);
                    });
  };
}


function dedupe(e, i, c) { // extra step to remove duplicates
  return c.indexOf(e) === i;
}

var options = {
      mgmtServer: opt.options.mgmtserver,
      org : opt.options.org,
      user: opt.options.username,
      password: opt.options.password,
      no_token: opt.options.notoken,
      verbosity: opt.options.verbose || 0
    };

apigeeEdge.connect(options, function(e, org) {
  if (e) {
    common.logWrite(JSON.stringify(e, null, 2));
    process.exit(1);
  }
  common.logWrite('connected');

  org.kvms.get({ env: opt.options.env }, function(e, result){
    if (e) {
      common.logWrite(JSON.stringify(e, null, 2));
      console.log(e.stack);
      process.exit(1);
    }

    var missingMaps = [opt.options.settingsmap, opt.options.secretsmap]
      .filter(function(value) { return result.indexOf(value) == -1; })
      .filter(dedupe);

    if (missingMaps && missingMaps.length > 0){
      common.logWrite('Need to create one or more maps');
      async.mapSeries(missingMaps, createOneKvm(org), function(e, results) {
        if (e) {
          common.logWrite(JSON.stringify(e, null, 2));
          console.log(e.stack);
          process.exit(1);
        }
        //console.log(JSON.stringify(results, null, 2) + '\n');
        loadDataIntoMaps(org, kvmsLoadedCb(org));
      });
    }
    else {
      common.logWrite('ok. the required maps exist');
      loadDataIntoMaps(org, kvmsLoadedCb(org));
    }
  });

});
