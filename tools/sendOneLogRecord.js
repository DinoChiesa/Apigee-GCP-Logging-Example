#! /usr/local/bin/node
/*jslint node:true, strict:implied, esversion:9 */
// sendOneLogRecord.js
// ------------------------------------------------------------------
// send one log record to GCP logging, using a service account key for authentication.
//
// Copyright 2017-2021 Google LLC.
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
// last saved: <2021-August-03 22:20:41>

const util    = require('util'),
      url     = require('url'),
      fs      = require('fs'),
      path    = require('path'),
      crypto  = require('crypto'),
      https   = require('https'),
      version = '20210803-1442';

const requiredScopes = 'https://www.googleapis.com/auth/logging.write',
      grant_type = 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      defaults = {message: 'hello, world', logid: 'testlog'};

function usage (args) {
  let basename = path.basename(process.argv[1]);
  console.log(`${basename} : send one log record to GCP Logging\n`);
  console.log(`to send with a new token derived from Service Account json:`);
  console.log(`  node ${basename} --keyfile SERVICE_ACCOUNT_KEYFILE [OTHER_OPTIONS]\n`);
  console.log(`to send with an existing token:`);
  console.log(`  node ${basename} --token TOKEN --projectid PROJECTID [OTHER_OPTIONS] \n`);
  console.log(`other options:`);
  console.log(`  --logid ID           short ID of log to write. default is '${defaults.logid}'`);
  console.log(`  --message MESSAGE    message to log. default is '${defaults.message}'`);
  console.log(`  -v                   verbose mode`);
}

function logWrite() {
  var time = (new Date()).toString(),
      tstr = '[' + time.substr(11, 4) + '-' +
    time.substr(4, 3) + '-' + time.substr(8, 2) + ' ' +
    time.substr(16, 8) + '] ';
  console.log(tstr + util.format.apply(null, arguments));
}

function httpRequest({verbose, req}) {
  if (verbose) {
    logWrite('%s %s', req.method.toUpperCase(), req.url);
  }
  return new Promise((resolve, reject) => {
    let parsed = url.parse(req.url),
        options = {
          host: parsed.host,
          path: parsed.path,
          method : req.method,
          headers : req.headers
        },
        request = https.request(options, function(res) {
          let payload = '';
          if (verbose) {
            logWrite('%d', res.statusCode);
          }
          res.on('data', chunk => payload += chunk);
          res.on('end', () => resolve(JSON.parse(payload)));
          res.on('error', e => reject(e));
        });
    if (req.body) {
      request.write(req.body);
    }
    request.end();
  });
}

const toBase64UrlNoPadding =
  s => s.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const base64EncodeString =
  theString => toBase64UrlNoPadding(Buffer.from(theString).toString('base64'));

function signJwt(header, payload, key) {
  if ( ! header.alg) {
    throw new Error("missing alg");
  }
  if (header.alg != 'RS256') {
    throw new Error('unhandled alg: ' + header.alg);
  }
  let signer = crypto.createSign('sha256');
  let signatureBase =
    [header, payload]
      .map( x => base64EncodeString(JSON.stringify(x)) )
      .join('.');
  signer.update(signatureBase);
  let computedSignature = toBase64UrlNoPadding(signer.sign(key, 'base64'));
  return signatureBase + '.' + computedSignature;
}

function getGoogleAuthJwt(ctx) {
  let keyfile = ctx.keyfilecontents,
      nowInSeconds = Math.floor(Date.now() / 1000),
      jwtHeader = { alg : 'RS256', typ : 'JWT' },
      jwtClaims = {
        iss   : keyfile.client_email,
        aud   : keyfile.token_uri,
        iat   : nowInSeconds,
        exp   : nowInSeconds + 60,
        scope : requiredScopes
      };
  if (ctx.options.verbose) {
    logWrite('jwt payload: ' + JSON.stringify(jwtClaims, null, 2));
  }
  return Promise.resolve({
    ...ctx,
    assertion: signJwt(jwtHeader, jwtClaims, keyfile.private_key)
  });
}

function redeemJwtForAccessToken(ctx) {
  if (ctx.options.verbose) {
    logWrite('assertion: ' + util.format(ctx.assertion));
  }
  let req = {
        url : ctx.keyfilecontents.token_uri,
        headers : {
          'content-type': 'application/x-www-form-urlencoded'
        },
        method : 'post',
        body : `grant_type=${grant_type}&assertion=${ctx.assertion}`
      };
  return httpRequest({verbose:ctx.options.verbose, req})
    .then(tokenResponse => {
      if (ctx.options.verbose) {
        logWrite(`token: ${tokenResponse.access_token}`);
      }
      return {...ctx, tokenResponse, access_token:tokenResponse.access_token};
    });
}

function writeToGcpLog(ctx) {
  let logid = ctx.options.logid || defaults.logid,
      body = {
        "logName": `projects/${ctx.project_id}/logs/${logid}`,
        "resource" : {
          "type": "api",
          "labels": {}
        },
        "labels": {
          "flavor": "test"
        },
        "entries": [
          {
            "severity" : "INFO",
            "textPayload" : ctx.options.message || defaults.message
          }
        ],
        "partialSuccess": true
      },
      req = {
        url : 'https://logging.googleapis.com/v2/entries:write',
        headers : {
          'authorization': `Bearer ${ctx.access_token}`,
          'content-type' : 'application/json'
        },
        method : 'post',
        body : JSON.stringify(body)
      };
  if (ctx.options.verbose) {
    logWrite('log request body: ' + JSON.stringify(body, null, 2));
  }
  return httpRequest({verbose:ctx.options.verbose, req})
    .then(logResponse => ({...ctx, logResponse}));
}

process.on('unhandledRejection',
            r => console.log('\n*** unhandled promise rejection: ' + util.format(r)));


function processArgs(args) {
  let awaiting = null, options = {};
  const validArgs = ['keyfile', 'message', 'token', 'projectid'];

  args.forEach((arg) => {
    if (awaiting) {
      options[awaiting] = arg;
      awaiting = null;
    }
    else if (arg.startsWith('--')) {
      let thisArg = validArgs.find(s => s == arg.substring(2));
      if (thisArg) {
        if (options[thisArg]) {
          throw new Error('duplicate argument: ' + arg);
        }
        awaiting = thisArg;
      }
      else {
        throw new Error('unexpected argument: ' + arg);
      }
    }
    else {
      switch(arg) {
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-h':
      case '--help':
        usage();
        process.exit(1);
        return null;
      default:
        throw new Error('unexpected argument: ' + arg);
      }
    }
  });
  return options;
}

function main(args) {
  try {
    let options = processArgs(args);
    if(options.verbose) {
      console.log(
        `Apigee example GCP Logging exerciser tool, version: ${version}\n`);
    }

    if (( !options.keyfile && ( ! (options.token && options.projectid) )) ||
        ( options.keyfile && ( (options.token || options.projectid) ))) {
      console.log('You must specify\n  EITHER: a Service Account JSON key file\n  OR: a token and a projectid\n');
      usage();
      process.exit(1);
      return;
    }

    let ctx = {options};
    if (options.keyfile) {
      ctx.keyfilecontents = JSON.parse(fs.readFileSync(options.keyfile, 'utf8'));
      if ( ! ctx.keyfilecontents.client_email || !ctx.keyfilecontents.token_uri) {
        throw new Error('that does not look like a Service Account key file.');
      }
      ctx.project_id = ctx.keyfilecontents.project_id;
    }
    else {
      ctx.project_id = options.projectid;
      ctx.access_token = options.token;
    }

    let p = (options.token) ? Promise.resolve(ctx) :
      getGoogleAuthJwt(ctx).then(redeemJwtForAccessToken);

    p.then(writeToGcpLog)
      .catch( e => console.log(util.format(e)));
  }
  catch(e) {
    console.log("Exception:" + util.format(e));
  }
}

// process.argv array starts with 'node' and 'scriptname.js'
main(process.argv.slice(2));
