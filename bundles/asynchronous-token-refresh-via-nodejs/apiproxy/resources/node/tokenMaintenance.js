// tokenMaintenance.js
// ------------------------------------------------------------------
//
// nodejs code to do asynchronous token maintenance within an API Proxy.
// It refreshes the GCP oauth token periodically, outside of the scope of any particular API request.
//
// Copyright 2017 Google Inc.
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
// created: Wed Nov 15 10:45:33 2017
// last saved: <2017-December-08 13:24:40>

if ( ! Error) {
  function Error() {};
}

var apigee = require('apigee-access');
var jwt = require('jsonwebtoken');
var querystring = require('querystring');
var app = require('express')();
var request = require('request'); // must use older request, to avod ES6 dependencies.
var cache = apigee.getCache('cache1', {scope: 'application', resource: 'cache1'});
var constants = {
      notMuchTimeInSeconds : 600,
      audience: "https://www.googleapis.com/oauth2/v4/token",
      jwtScope: "https://www.googleapis.com/auth/logging.write",
      cachekeys: {
        token: 'stackdriver-access-token',
        tokenExpiry: 'stackdriver-access-token-expiry-xx'
      },
      kvms : {
        secrets : 'secrets1',
        settings : 'settings1',
      },
      kvmkeys : {
        privKeyPem: 'stackdriver.privKeyPem',
        jwtIssuer : 'stackdriver.jwt_issuer'
      }
    };
var currentToken;
var kvmSecrets = apigee.getKeyValueMap(constants.kvms.secrets, 'environment');
var kvmSettings = apigee.getKeyValueMap(constants.kvms.settings, 'environment');

function getToken(cb) {
  var nowInSeconds = Math.floor(Date.now() / 1000);
  var timeUntilNextRun;
  console.log('getToken: hello.');
  cache.get(constants.cachekeys.tokenExpiry, function(e, expiryTimeInSeconds) {
    console.log('getToken: expiryTime(%s) now(%d)', expiryTimeInSeconds, nowInSeconds);
    expiryTimeInSeconds = (e) ? 0 : (expiryTimeInSeconds ? parseInt(expiryTimeInSeconds, 10) : 0);
    var remainingTimeInSeconds = (expiryTimeInSeconds === 0 )? 0 : Math.abs(expiryTimeInSeconds - nowInSeconds);
    console.log('getToken: remainingTime(%d)', remainingTimeInSeconds);
    if (expiryTimeInSeconds === 0 || remainingTimeInSeconds < constants.notMuchTimeInSeconds) {
      console.log('getToken: generating new token');
      kvmSecrets.get(constants.kvmkeys.privKeyPem, function(e, privKeyPem) {
        if (e) {
          console.log('getToken: cannot read kvm(A). ' + e);
          if (typeof cb == 'function') cb(e);
          return;
        }
        kvmSettings.get(constants.kvmkeys.jwtIssuer, function(e, jwtIssuer) {
          if (e) {
            console.log('getToken: cannot read kvm(B). ' + e);
            if (typeof cb == 'function') cb(e);
            return;
          }
          // example jwt payload = {
          //   iss:"service-account-1@project-name-here.iam.gserviceaccount.com",
          //   scope:"https://www.googleapis.com/auth/logging.write",
          //   aud:"https://www.googleapis.com/oauth2/v4/token",
          //   exp:1328554385,
          //   iat:1328550785
          // }

          var payload = {
                iss: jwtIssuer,
                aud: constants.audience,
                scope: constants.jwtScope,
                iat: nowInSeconds,
                exp: nowInSeconds + (3 * 60)
              };

          console.log('getToken: JWT payload: ' + JSON.stringify(payload));

          var token;
          try {
            // sign with RSA SHA256
            token = jwt.sign(payload, privKeyPem, { algorithm: 'RS256'});
          }
          catch (exc1) {
            // could happen if PEM is malformed
            console.log('Exception during sign: ' + exc1);
            if (typeof cb == 'function') cb(exc1);
            return;
          }

          var requestOptions = {
                url: constants.audience,
                method: 'post',
                body : querystring.stringify({
                  grant_type : 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                  assertion: token
                }),
                headers : {
                  'content-type': 'application/x-www-form-urlencoded'
                }
              };

          console.log('getToken: encoded JWT: %s...',  token.substring(0, 45));
          request(requestOptions, function(error, httpResponse, body){
            if (error) {
              console.log('getToken: error requesting token: ' + error);
              if (typeof cb == 'function') cb(error);
            }
            else {
              console.log('getToken: token response: ' + body);
              body = JSON.parse(body);
              var cacheTTL_inSeconds = body.expires_in - 2;
              nowInSeconds = Math.floor(Date.now() / 1000);
              cache.put(constants.cachekeys.token, body.access_token, cacheTTL_inSeconds, function(e) {
                if (e) {
                  console.log('getToken: error caching token: ' + e);
                  if (typeof cb == 'function') cb(e);
                  return;
                }

                  var expiryTimeInSeconds = Math.abs(nowInSeconds + body.expires_in).toFixed(0);
                  cache.put(constants.cachekeys.tokenExpiry, expiryTimeInSeconds, cacheTTL_inSeconds, function(e) {
                    currentToken = body.access_token;
                    timeUntilNextRun = Math.floor(1000 * (cacheTTL_inSeconds - constants.notMuchTimeInSeconds));
                    console.log('getToken: token has been cached. sleeping (%d) seconds', Math.floor(timeUntilNextRun / 1000));
                    setTimeout(getToken, timeUntilNextRun);
                    if (typeof cb == 'function') {
                      cb(null, body.access_token);
                    }
                  });

              });
            }
          });
        });
      });
    }
    else {
      timeUntilNextRun = 1000 * (remainingTimeInSeconds - 120);
      console.log('getToken: not generating new token - already current. sleeping (%d) seconds', Math.floor(timeUntilNextRun / 1000));
      setTimeout(getToken, timeUntilNextRun);
    }
  });
}

function kickoff() {
  getToken(function(e) {});
}

// default behavior
app.all(/^\/.*/, function(request, response) {
  response.header('Content-Type', 'application/json')
    .status(404)
    .send('{ "message" : "This is not the server you\'re looking for." }\n');
});

var port = process.env.PORT || 5950;
app.listen(port, function() {
  console.log('tokenMaintenance.js listening');
  kickoff();
});
