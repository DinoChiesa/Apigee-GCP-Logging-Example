# Stackdriver demo proxy

Monday, 13 February 2017, 17:54

This API Proxy shows how to do logging from Edge to Stackdriver using
built-in policies, plus the JWT generator. 

There are multiple things required:

 - encrypted KVM called "secrets1"
 - regular KVM called "settings1"
 - cache called cache1

all environment-scoped.


## First things first

Get your service account set up with the Google API console.
You need a private key, and a client_id or email account for the service account.
Save the private key to a file. 
You also need a project  id and a log id. These are stackdriver things.


## Setting up the KVMs and Cache

To set up these pre-requisites, there is a provisionKvmAndCache.js script in the
tools directory. 

```
cd tools
node ./provisionKvmAndCache.js -n -o cap500 -e test \
    -P fine-guru -L syslog  \
    -k ~/dev/stackdriver/fine-guru.privatekey \
    -I service-account-1@fine-guru.iam.gserviceaccount.com

```

## Importing and Deploying the Proxy

You also need to import and deploy the proxy.  To do so:

```
cd tools
node ./importAndDeployProxy.js -o cap500 -n -d .. -N stackdriver-1 -e test
```


## Invoking the Proxy

```
curl -i https://cap500-test.apigee.net/stackdriver-1/t1 \
  -H content-type:application/json \
  -d '{ "payload" : "thanks for all the fish" }'

```
