// log-To-Stackdriver-2.js
// ------------------------------------------------------------------
//
// Send a POST to stackdriver without waiting for a response.
//
// created: Wed Feb 15 16:28:55 2017
// last saved: <2017-February-28 10:12:50>

// fire and forget
var payload = (new MessageTemplate(properties.payload)).fill();
var headers = {
      'Content-Type' : 'application/json',
      'Authorization' : (new MessageTemplate(properties.authz_header)).fill()
    };
var url = (new MessageTemplate(properties.endpoint)).fill();
var req = new Request(url, 'POST', headers, payload);
var exchange = httpClient.send(req);
