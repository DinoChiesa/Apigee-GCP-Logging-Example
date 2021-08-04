// extractFlatJsonToContextVars.js
// ------------------------------------------------------------------
// For a flat JSON payload, set context vars for all fields.
//
/* jshint esversion:6, node:false, strict:implied */
/* global properties, context */

var sourceVariable = properties.source || 'message.content';
var outputVarPrefix = properties['output-prefix'] || 'json';
function varname(propertyName) {
  return outputVarPrefix + '.' + propertyName;
}

try {
  var obj = JSON.parse(context.getVariable(sourceVariable));
  for (var p in obj) {
    context.setVariable(varname(p), obj[p]);
    // for diagnostics purposes only. Remove for production use.
    context.setVariable('SHREDDED.' + varname(p), obj[p]);
  }
}
catch (e) {
  context.setVariable('extract_error', "bad inbound message");
  context.setVariable('extract_exception', e.toString());
}
