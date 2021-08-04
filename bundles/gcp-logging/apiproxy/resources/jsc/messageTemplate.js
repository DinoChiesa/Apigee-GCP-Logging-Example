// messageTemplate.js
// ------------------------------------------------------------------
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
// last saved: <2020-December-22 07:53:14>
//
// A simple object that performs message templating.
// Accepts a string that includes patterns like {foo_bar} and replaces
// those curly-brace delimited strings with the values of the corresponding
// context variables.
//
// For example, the input string might be:
//
// {
//   "logName": "projects/{stackdriver.projectid}/logs/{stackdriver.logid}",
//   "resource" : { "type": "api", "labels": {} },
//   "entries": [{ "textPayload" : "{stackdriver.logpayload}" } ]
// }
//
// ...and given the context containing:
//
// stackdriver.projectid = id-i3892dnqwhjdk
// stackdriver.logid = 1981919
// stackdriver.logpayload = xyz123
//
// ... running this code:
//
// var tmpl = new MessageTemplate(inputString);
// var payload = tmpl.fill(); // evaluate it against context
//
// ... the value of the payload variable would be:
//
// {
//   "logName": "projects/id-i3892dnqwhjdk/logs/1981919",
//   "resource" : { "type": "api", "labels": {} },
//   "entries": [{ "textPayload" : "xyz123" } ]
// }
//
/* global context */

(function () {
  'use strict';
  var variableNameRe = "[^ \t\n\"',/\\\\{}]+?"; // non-greedy capture
  var varPrefixRe = '{';
  var varSuffixRe = '}';
  var variableRegex = new RegExp( varPrefixRe + '(' + variableNameRe + ')' + varSuffixRe);

  function MessageTemplate(tmpl) {
    this.template = tmpl;
  }

  MessageTemplate.prototype.fill = function() {
    // substitute all names surrounded by {curly_braces} in the template
    // with the value of the corresponding context variables
    var template = this.template;
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
  };

  // export
  var globalScope = (function(){ return this; }).call(null);
  globalScope.MessageTemplate = MessageTemplate;

}());
