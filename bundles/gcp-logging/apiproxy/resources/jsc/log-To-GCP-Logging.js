// log-To-GCP-Logging-2.js
// ------------------------------------------------------------------
//
// Send a POST to stackdriver without waiting for a response.
//
// Copyright 2017-2020 Google LLC.
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
// created: Wed Feb 15 16:28:55 2017
// last saved: <2020-December-22 07:59:22>
/* global MessageTemplate, properties, Request, httpClient */

var payload = (new MessageTemplate(properties.payload)).fill();
var headers = {
      'Content-Type' : 'application/json',
      'Authorization' : (new MessageTemplate(properties.authz_header)).fill()
    };
var url = (new MessageTemplate(properties.endpoint)).fill();
var req = new Request(url, 'POST', headers, payload);

// fire and forget
var exchange = httpClient.send(req);
