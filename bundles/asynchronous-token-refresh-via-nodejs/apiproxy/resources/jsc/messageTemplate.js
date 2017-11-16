// messageTemplate.js
// ------------------------------------------------------------------
//
// created: Wed Feb 15 16:28:55 2017
// last saved: <2017-February-28 10:09:31>
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

(function () {
  'use strict';
  var variableNameRe = "[^ \t\n\"',/\\\\]+?"; // non-greedy capture
  var varPrefixRe = '{';
  var varSuffixRe = '}';
  var variableRegex = new RegExp( varPrefixRe + '(' + variableNameRe + ')' + varSuffixRe, 'g');

  function MessageTemplate(tmpl) {
    this.template = tmpl;
  }

  MessageTemplate.prototype.fill = function() {
    // substitute all names surrounded by {curly_braces} in the template
    // with the value of the corresponding context variables
    var match;
    var template = this.template;
    while ((match = variableRegex.exec(template)) !== null) {
      var variableName = match[1];
      var value = context.getVariable(variableName);
      if (value && value !== '') {
        template = template.replace('{' + variableName + '}', value);
      }
      else {
        template = template.replace('{' + variableName + '}', 'n/a');
      }
    }
    return template + ''; // coerce to JS String
  };

  // export
  var globalScope = (function(){ return this; }).call(null);
  globalScope.MessageTemplate = MessageTemplate;

}());
