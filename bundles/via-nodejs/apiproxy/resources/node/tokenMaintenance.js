// tokenMaintenance.js
// ------------------------------------------------------------------
//
// nodejs code to do asynchronous token maintenance within an API Proxy.
// It refreshes the GCP oauth token periodically, outside of the scope of any particular API request.
//
// created: Wed Nov 15 10:45:33 2017
// last saved: <2017-November-15 17:48:11>

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
    console.log('getToken: expiryTime (%s) now(%d)', expiryTimeInSeconds, nowInSeconds);
    expiryTimeInSeconds = (e) ? 0 : (expiryTimeInSeconds ? parseInt(expiryTimeInSeconds, 10) : 0);
    var remainingTimeInSeconds = (expiryTimeInSeconds === 0 )? 0 : Math.abs(expiryTimeInSeconds - nowInSeconds);
    console.log('getToken: remainingTime (%d)', remainingTimeInSeconds);
    if (expiryTimeInSeconds === 0 || remainingTimeInSeconds < constants.notMuchTimeInSeconds) {
      console.log('getToken: generating new token');
      kvmSecrets.get(constants.kvmkeys.privKeyPem, function(e, privKeyPem) {
        if (e) {
          return console.log('getToken: cannot read kvm. ' + e);
        }
        kvmSettings.get(constants.kvmkeys.jwtIssuer, function(e, jwtIssuer) {
          if (e) {
            return console.log('getToken: cannot read kvm. ' + e);
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

          console.log('getToken: JWT payload: ' + JSON.stringify(payload, null, 2));
          // sign with RSA SHA256
          var token = jwt.sign(payload, privKeyPem, { algorithm: 'RS256'});

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
                }
                else {
                  var expiryTimeInSeconds = Math.abs(nowInSeconds + body.expires_in).toFixed(0);
                  cache.put(constants.cachekeys.tokenExpiry, expiryTimeInSeconds, cacheTTL_inSeconds, function(e) {
                    currentToken = body.access_token;
                    console.log('getToken: token has been cached');
                    timeUntilNextRun = Math.floor(1000 * (cacheTTL_inSeconds - constants.notMuchTimeInSeconds));
                    setTimeout(getToken, timeUntilNextRun);
                    if (typeof cb == 'function') {
                      cb(null, body.access_token);
                    }
                  });
                }
              });
            }
          });
        });
      });
    }
    else {
      console.log('getToken: not generating new token - already current');
      timeUntilNextRun = 1000 * (remainingTimeInSeconds - 120);
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
