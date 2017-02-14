#! /usr/local/bin/node
/*jslint node:true */
// importAndDeployProxy.js
// ------------------------------------------------------------------
// import and deploy an Apigee Edge proxy bundle
//
// last saved: <2017-February-13 21:45:23>

var fs = require('fs'),
    common = require('./lib/utility.js'),
    sprintf = require('sprintf-js').sprintf,
    apigeeEdge = require('./lib/edge.js'),
    Getopt = require('node-getopt'),
    version = '20170213-2144',
    defaults = { basepath : '/' },
    getopt = new Getopt(common.commonOptions.concat([
      ['d' , 'srcdir=ARG', 'source directory for the proxy files. Should be parent of dir "apiproxy"'],
      ['N' , 'proxyname=ARG', 'name for API proxy '],
      ['e' , 'env=ARG', 'the Edge environment.'],
      ['b' , 'basepath=ARG', 'basepath for deploying the API Proxy. Default: ' + defaults.basepath],
      ['X' , 'nodeploy', 'do not deploy the API Proxy.']
    ])).bindHelp();


// ========================================================

console.log(
  'Apigee Edge Proxy Import + Deploy tool, version: ' + version + '\n' +
    'Node.js ' + process.version + '\n');

common.logWrite('start');

// process.argv array starts with 'node' and 'scriptname.js'
var opt = getopt.parse(process.argv.slice(2));

if ( !opt.options.srcdir ) {
  console.log('You must specify a source directory');
  getopt.showHelp();
  process.exit(1);
}

if ( !opt.options.proxyname ) {
  console.log('You must specify a name for the proxy');
  getopt.showHelp();
  process.exit(1);
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
