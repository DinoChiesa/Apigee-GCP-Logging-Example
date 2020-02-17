// log-To-Stackdriver.js
// ------------------------------------------------------------------
//
// Send a POST to stackdriver without waiting for a response.
//
// Copyright 2017 Google LLC.
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
// last saved: <2018-August-20 10:06:52>

var variableNameRe = "[^ \t\n\"',/\\\\{}]+?"; // non-greedy capture
var varPrefixRe = '{';
var varSuffixRe = '}';
var variableRegex = new RegExp( varPrefixRe + '(' + variableNameRe + ')' + varSuffixRe);

function fillTemplate(template) {
  // substitute all names surrounded by {curly_braces} in the template
  // with the value of the corresponding context variables
  var match = variableRegex.exec(template);
  while (match !== null) {
    var variableName = match[1];
    var value = context.getVariable(variableName);
    if (value && value !== '') {
      template = template.replace('{' + variableName + '}', value);
    }
    else {
      template = template.replace('{' + variableName + '}', 'n/a');
    }
    match = variableRegex.exec(template);
  }
  return template + '';
}

// fire and forget
var payload = fillTemplate(properties.payload);
var headers = {
      'Content-Type' : 'application/json',
      'Authorization' : fillTemplate(properties.authz_header)
    };
var url = fillTemplate(properties.endpoint);
var req = new Request(url, 'POST', headers, payload);
var exchange = httpClient.send(req);
