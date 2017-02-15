# Stackdriver demo proxy

Monday, 13 February 2017, 17:54

This API Proxy shows how to do logging from Edge to Stackdriver using
built-in policies, plus the JWT generator. 

There are multiple things required:

 - encrypted KVM called "secrets1"
 - regular KVM called "settings1"
 - cache called cache1

all environment-scoped.


## Some Screencasts to show it working. 

Here's a talk-through of how it works. Click the image to see the screencast:

### Part 1: setting up Stackdriver

[![Youtube video: Setting up a Stackdriver Account](./images/screenshot-20170215-105158.png)](http://www.youtube.com/watch?v=7tkAkykALNs "Setting up a Stackdriver Account")


### Part 2: Configuring Edge and using the API Proxy

[![Youtube video: Using Stackdriver from Edge](./images/screenshot-20170214-115338.png)](http://www.youtube.com/watch?v=ozxELv8Z2G0 "Using Stackdriver from Edge")


## How to use: First things first

Get your service account set up with the Google API console.
You need a private key, and a client_id or email account for the service account.
Save the private key to a file. 
You also need a project  id and a log id. These are stackdriver things.


## Setting up the KVMs and Cache

To set up these pre-requisites, there is a [provisionKvmAndCache.js](./tools/provisionKvmAndCache.js) script in the
tools directory. For this you need to specify:

* name of Edge organization and environment
* the JSON file that you download from Stackdriver

The JSON file contains information such as: 

* Stackdriver project id
* the PEM-encoded private key you got from stackdriver
* the issuer, or email of the service account you got from stackdriver


Example:
```
node ./tools/provisionKvmAndCache.js  -n -o cap500 -e test \ 
    -J ~/dev/stackdriver/project-apigee-edge-0bb2933e52e4.json  
```

There are some optional parameters to this script as well, but you probably won't need them.
Make sure everything succeeds.


## Importing and Deploying the Proxy

After provisioning the KVMs and Cache, you also need to import and deploy the proxy.  To do so, run the 
[importAndDeployProxy.js](./tools/importAndDeployProxy.js) script. Again, specify the Edge organization and environment.

```
node ./tools/importAndDeployProxy.js -n -o cap500 -e test 
```

There are some optional parameters; you probably won't need them.

Everything should succeed. If not, then check if 
the cache or KVMs were not properly configured.


## Invoking the Proxy

```
curl -i https://cap500-test.apigee.net/stackdriver-1/t1 \
  -H content-type:application/json \
  -d '{ "payload" : "YOUR MESSAGE GOES HERE" }'
```

## View the logs in Stackdriver

Then, open the Stackdriver webapp and view the log messages:

![Youtube video: Using Stackdriver from Edge](./images/screenshot-20170214-120451.png)


## Dependencies

This project depends on the JAR from the JWT Generator callout that is available [here](https://github.com/apigee/iloveapis2015-jwt-jwe-jws).
I've just included the binary JAR.  If for some reason you want to re-build the JAR from source, see that repo. 


## License

This material is copyright 2017 Google Inc.
and is licensed under the [Apache 2.0 License](LICENSE). This includes the the API Proxy configuration as well as the nodejs tools.
