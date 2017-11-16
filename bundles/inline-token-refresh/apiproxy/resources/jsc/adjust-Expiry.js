var ttlValue = context.getVariable(properties.ttlValueVar);
ttlValue -= parseInt(properties.delta, 10);
context.setVariable(properties.ttlValueVar, ttlValue);
