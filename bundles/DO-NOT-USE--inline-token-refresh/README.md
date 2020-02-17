# DO NOT USE

Do not use this API Proxy. This API proxy uses an external Java callout to
produce the signed JWT necessary to get a stackdriver access token.

At one time that was necessary, but now, Apigee includes support for generating
JWT, via the builtin GenerateJWT policy.  Use that instead.

This directory is included just for archival purposes.
