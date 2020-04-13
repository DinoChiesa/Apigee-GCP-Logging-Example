# Stackdriver demo proxy

This repo includes two distinct API Proxy bundles showing how to do logging from Apigee Edge to Google Stackdriver.

## License

This material is Copyright 2017-2020 Google LLC and is licensed under the [Apache 2.0
License](LICENSE). This includes the the API Proxy configuration as well as the
nodejs tools and libraries.

## Disclaimer

This example is not an official Google product, nor is it part of an official Google product.
If you have questions on using it, please ask  via github or community.apigee.com .

## What is Stackdriver?

[Stackdriver](https://cloud.google.com/stackdriver/) is a SaaS for logging, monitoring, and
alerting. It started as an independent company but was acquired by Google in 2014,
and is now part of the Google Cloud Platform (as is Apigee). Stackdriver
exposes a REST API to allow systems or applications to write log messages into the
Stackdriver log. There is a UI for viewing the messages, configuring alerts on
the messages, and so on.

## How does Stackdriver complement Apigee Edge?

Some people embed MessageLogging policies into the API Proxies they have in Apigee
Edge in order to log messages that can later be examined or analyzed, to diagnose
problems or simply to monitor their systems. MessageLogging works for syslog
listeners. For example, Splunk has a syslog listener that will accept inbound
messages from a MessageLogging policy configured in Apigee Edge.

But some people don't like the expense of Splunk, and are considering using the
Google Cloud Platform. This example shows how you can use Stackdriver, part of
GCP, to collect and aggregate log messages from Edge, using built-in policies.

## How it works

The Stackdriver API supports OAuth 2.0 for inbound API calls to write (or read, or
query) log messages. For our purposes, we want Apigee Edge to only write messages.  The
OAuth token is a standard bearer token, and Google dispenses the token via an RFC7523
grant (see [RFC 7523 - JSON Web Token (JWT) Profile for OAuth 2.0 Client Authentication
and Authorization Grants](https://tools.ietf.org/html/rfc7523)).  This grant is very
much like a client credentials grant as described in [RFC 6749 - OAuth
2.0](https://tools.ietf.org/html/rfc6749), except, rather than sending in a client_id
and client_secret in order to obtain a token, the client must generate and self-sign a
JWT, and send that JWT in the request-for-token. There are some requirements on the
JWT. It must:

* include the client email as the issuer
* specify "https://www.googleapis.com/oauth2/v4/token" as the audience
* specify "https://www.googleapis.com/auth/logging.write" as the scope claim
* expire within no more than 300 seconds
* be signed with the client's private key.

Example payload:

```json
{"alg":"RS256","typ":"JWT"}
{
  "iss":"service-account-1@project-name-here.iam.gserviceaccount.com",
  "scope":"https://www.googleapis.com/auth/logging.write",
  "aud":"https://www.googleapis.com/oauth2/v4/token",
  "exp":1328554385,
  "iat":1328550785
}
```

The request for token looks like this:

```
POST https://www.googleapis.com/oauth2/v4/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=JWT_GOES_HERE
```

If the JWT is valid, googleapis.com will return an access token, which will have a
lifetime of 1 hour.  (Though Google may change this I suppose). The response looks
like this:

```json
{
  "access_token" : "1/8xbJqaOZXSUZbHLl5EOtu1pxz3fmmetKx9W8CV4t79M",
  "token_type" : "Bearer",
  "expires_in" : 3600
}
```

That access token can then be used against the Stackdriver APIs.

The point here is that a system that logs to Stackdriver must obtain and cache the access token, and must be able to obtain new access tokens on expiry.

Once the system has a valid access token, it can invoke the Stackdriver API for logging. That looks like this:

```
POST https://logging.googleapis.com/v2/entries:write
Authorization: Bearer :token

{
  "logName": "projects/:projectid/logs/:logid",
  "resource" : {
    "type": "api",
    "labels": { }
  },
  "labels": {
      "flavor": "test"
  },
  "entries": [{
      "severity" : "INFO",
      "textPayload" : "Hello I must be going"
     }
  ],
  "partialSuccess": true
}
```

The example here is an API Proxy that performs all of the above.

## What's Included?

There's a single API Proxy bundle that provides the example you should follow: 
[stackdriver-1](./bundles/inline-builtin-token-refresh). This aPI proxy
refreshes the access_token for stackdriver inline with respect to the API
request, relying on builtin Apigee policies like GenerateJWT, ServiceCallout,
LookupCache and PopulateCache.


## Required in Apigee

To support the management of tokens for use against Stackdriver, there are
multiple artifacts required on the Apigee Edge side:

 - encrypted KVM called "secrets1"
 - regular KVM called "settings1"
 - cache called cache1

All environment-scoped.

The secrets1 KVM stores the private key of the client (the service account), which is
used to sign the JWT required to get each new access token.  The cache stores the access
token for its lifetime. And the other KVM stores other stackdriver-related settings,
like the project ID and so on.


## Some Screencasts to guide you

Here's a talk-through of how it works. Click the image to see the screencast:

### Part 1: setting up Stackdriver

[![Youtube video: Setting up a Stackdriver Account](./images/screenshot-20170215-105158.png)](http://www.youtube.com/watch?v=7tkAkykALNs "Setting up a Stackdriver Account")

### Part 2: Configuring Edge and Using the API Proxy

[![Youtube video: Using Stackdriver from Edge](./images/screenshot-20170214-115338.png)](http://www.youtube.com/watch?v=9QyxrVvGd_I "Using Stackdriver from Edge")


## How to use: First things first

This is covered in the "Part 1" screencast above.  Go to
[Stackdriver](https://cloud.google.com/stackdriver/) , and set up a project; select a unique
project id.  Also, using [the Google API console](https://console.cloud.google.com/apis),
enable the project for the Stackdriver APIs.  Finally, using [the service accounts
management page](https://console.developers.google.com/iam-admin/serviceaccounts), create a
service account, generate a new private key for the service account, and save the private
key to a JSON file.  All of this is shown in the screencast.



## Setting up the KVMs and Cache

This part is covered in the "Part 2" Screencast.

The API Proxy within Apigee Edge uses a cache and a couple KVM maps.
To set up these pre-requisites, there is a [provisionKvmAndCache.js](./tools/provisionKvmAndCache.js) script in the
tools directory. For this you need to specify:

* name of Edge organization and environment
* the JSON file that you download from Stackdriver

The JSON file contains information such as:

* Stackdriver project id
* the PEM-encoded private key you got from Stackdriver
* the issuer, or email of the service account you got from Stackdriver

Before you start you must install the node libraries.
```
cd tools
npm install
```

Example (running from the tools directory):
```
node ./provisionKvmAndCache.js  -n -o ORGNAME -e ENVNAME \
    -J ~/dev/stackdriver/project-apigee-edge-0bb2933e52e4.json
```

There are some optional parameters to this script as well, but don't use them unless you know what you're getting into.
Make sure everything succeeds.


## Importing and Deploying the Proxy

After provisioning the KVMs and Cache, you also need to import and deploy one or both of the proxies.  To do so, run the
[importAndDeploy.js](./tools/importAndDeploy.js) script. Again, specify the Edge organization and environment.

To deploy the proxy:
```
node ./importAndDeploy.js -u username@example.com -v -o ORGNAME -e ENVNAME -d ../bundles/inline-builtin-token-refresh
```

Note: replace ORGNAME and ENVNAME with the name of your organization and environment. Replace username@example.com with your Apigee signin .

There are some optional parameters to that script; you probably won't need them.

Everything should succeed. If not, then check if the cache or KVMs were properly
configured.


## Invoking the Proxy

After you've provisioned the KVM and cache, and then imported and deployed the proxy, you should be able to invoke it.  Here's a sample call invoking the API proxy that does "inline" token refreshing:

```
curl -i https://ORGNAME-ENVNAME.apigee.net/stackdriver-1/t1 \
  -H content-type:application/json \
  -d '{ "payload" : "YOUR MESSAGE GOES HERE" }'
```
This invokes Stackdriver via the httpClient from within a JavaScript callout. The httpClient does not wait for a response. This means a minimum of delay introduced into the proxy flow.

To invoke the API that logs to Stackdriver and waits for a response, we can use ServiceCallout. Like this:

```
curl -i https://ORGNAME-ENVNAME.apigee.net/stackdriver-1/t1 \
  -H content-type:application/json \
  -H useSC:true \
  -d '{ "payload" : "This Message was Delivered via ServiceCallout" }'
```

You may see tens of ms difference between these two mechanisms. Check the trace UI for timings.

To use the version of the API Proxy that uses asynchronous refresh of the token, use this:
```
curl -i https://ORGNAME-ENVNAME.apigee.net/stackdriver-2/t1 \
  -H content-type:application/json \
  -d '{ "payload" : "YOUR MESSAGE GOES HERE" }'
```


## View the logs in Stackdriver

Then, open [the Stackdriver logviewer webapp](https://console.cloud.google.com/logs/viewer) to view the log messages:
You need to select "Produced API" in the dropdown.

![Selecting the dropdown](./images/screenshot-20170214-120451.png)

## A Pattern

Most Google Cloud services are available via the same OAuth 2.0 pattern. If you
have a service account, you can use the same basic API Proxy to obtain a token
for other services. You need only to request the proper scopes, in the JWT. And
of course you need to authorize the service account for those scopes. 

