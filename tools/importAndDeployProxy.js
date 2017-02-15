#! /usr/local/bin/node
/*jslint node:true */
// importAndDeployProxy.js
// ------------------------------------------------------------------
// import and deploy an Apigee Edge proxy bundle
//
// last saved: <2017-February-15 09:34:41>

var fs = require('fs'),
    common = require('./lib/utility.js'),
    sprintf = require('sprintf-js').sprintf,
    apigeeEdge = require('./lib/edge.js'),
    Getopt = require('node-getopt'),
    version = '20170215-0934',
    path = require('path'),
    scriptRoot = path.resolve(__dirname),
    defaults = { basepath : '/', srcdir: path.resolve(path.join(scriptRoot, '..')), proxyname: 'stackdriver-1'},
    getopt = new Getopt(common.commonOptions.concat([
      ['e' , 'env=ARG', 'required. the Edge environment.'],
      ['d' , 'srcdir=ARG', 'optional. source directory for the proxy files. Should be parent of dir "apiproxy". Default: ' + defaults.srcdir],
      ['N' , 'proxyname=ARG', 'optional. name for API proxy. Default: ' + defaults.proxyname],
      ['b' , 'basepath=ARG', 'optional. basepath for deploying the API Proxy. Default: ' + defaults.basepath],
      ['X' , 'nodeploy', 'optional. Import only; do not deploy the API Proxy.']
    ])).bindHelp();


// ========================================================

console.log(
  'Apigee Edge Proxy Import + Deploy tool for Stackdriver demo, version: ' + version + '\n' +
    'Node.js ' + process.version + '\n');

common.logWrite('start');

// process.argv array starts with 'node' and 'scriptname.js'
var opt = getopt.parse(process.argv.slice(2));

if ( !opt.options.srcdir ) {
  common.logWrite(sprintf('defaulting to %s for srcdir', defaults.srcdir));
  opt.options.srcdir = defaults.srcdir;
}

if ( !opt.options.proxyname ) {
  common.logWrite(sprintf('defaulting to %s for proxyname', defaults.proxyname));
  opt.options.proxyname = defaults.proxyname;
}

common.verifyCommonRequiredParameters(opt.options, getopt);

apigeeEdge.setEdgeConnection(opt.options.mgmtserver, opt.options.org, {
  headers : { accept: 'application/json' },
  auth : {
    user: opt.options.username,
    pass: opt.options.password,
    sendImmediately : true
  }});

apigeeEdge.importProxyFromDir(opt.options.proxyname, opt.options.srcdir, function(e, result){
  if (e) {
    console.log(e);
    console.log(e.stack);
    process.exit(1);
  }
  common.logWrite(sprintf('ok. proxy name: %s r%d', result.name, result.revision));
  if (opt.options.env && !opt.options.nodeploy) {
    var options = {
          name: result.name,
          revision: result.revision,
          environment: opt.options.env,
          basepath: opt.options.basepath || defaults.basepath
        };
    apigeeEdge.deployProxy(options, function(e, result) {
      if (e) throw e;
      common.logWrite('ok.');
    });
  }
  else {
    common.logWrite('not deploying...');
    common.logWrite('finish');
  }
});
