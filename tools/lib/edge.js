// edge.js
// ------------------------------------------------------------------
//
// library of functions for Apigee Edge
//
// created: Mon Jun  6 17:32:20 2016
// last saved: <2017-February-14 17:54:48>

(function (){
  var path = require('path'),
      fs = require('fs'),
      qs = require('qs'),
      archiver = require('archiver'),
      sprintf = require('sprintf-js').sprintf,
      merge = require('merge'),
      common = require('./utility.js'),
      request = require('request'),
      gRequestOptions, gUrlBase, gOrgProperties = null;

  function commonCallback(okstatuses, cb) {
    return function (error, response, body) {
      var result;
      common.logWrite('status: ' + response.statusCode );
      if (error) {
        console.log(error);
        return cb(error, body);
      }
      if (okstatuses.indexOf(response.statusCode) > -1) {
        result = JSON.parse(body);
        cb(null, result);
      }
      else {
        console.log(body);
        cb({error: 'bad status', statusCode: response.statusCode });
      }
    };
  }

  function _setEdgeConnection(mgmtserver, org, requestOptions) {
    gUrlBase = common.joinUrlElements(mgmtserver, '/v1/o/', org);
    gRequestOptions = merge(true, requestOptions);
    gOrgProperties = null;
  }

  function _get(url, cb) {
    common.logWrite(sprintf('GET %s', url));
    request.get(url, gRequestOptions, commonCallback([200], cb));
  }

  function _deployAsset(options, assetType, cb) {
    // curl -X POST \
    //   -H content-type:application/x-www-form-urlencoded \
    //   "${mgmtserver}/v1/o/${org}/e/${environment}/apis/${proxyname}/revisions/${rev}/deployments" \
    //   -d 'override=true&delay=60'
    var qparams = {
          override : (options.hasOwnProperty('override')) ? options.override : true,
          delay : (options.hasOwnProperty('delay')) ? options.delay : 60
        };
    var collection = getCollectionForAssetType(assetType);
    if ( ! collection) {
      return cb(new Error('The assetType is not supported'));
    }
    if (assetType == 'apiproxy') {
      qparams.basepath = options.basepath || '/';
    }
    common.logWrite(sprintf('deploy %s %s r%d to env:%s',
                            assetType, options.name, options.revision, options.environment));

    var requestOptions = merge(true, gRequestOptions);

    requestOptions.headers['content-type'] = 'application/x-www-form-urlencoded';
    requestOptions.body = qs.stringify(qparams);
    requestOptions.url = common.joinUrlElements(gUrlBase,
                                                'e', options.environment,
                                                collection, options.name,
                                                'revisions', options.revision,
                                                'deployments');
    common.logWrite(sprintf('POST %s', requestOptions.url));
    request.post(requestOptions, commonCallback([200], cb));
  }

  function _deployProxy(options, cb) {
    return _deployAsset(options, 'apiproxy', cb);
  }

  function _deploySharedFlow(options, cb) {
    return _deployAsset(options, 'sharedflowbundle', cb);
  }

  function _undeployAsset(options, assetType, cb){
    // DELETE :mgmtserver/v1/o/:orgname/e/:envname/apis/:proxyname/revisions/:revnum/deployments
    // Authorization: :edge-auth
    var collection = getCollectionForAssetType(assetType);
    common.logWrite(sprintf('Undeploy %s %s r%d from env:%s', assetType, options.name, options.revision, options.environment));
    var requestOptions = merge(true, gRequestOptions);
    requestOptions.url = common.joinUrlElements(gUrlBase,
                                                'e', options.environment,
                                                collection, options.name,
                                                'revisions', options.revision,
                                                'deployments');
    common.logWrite(sprintf('DELETE %s', requestOptions.url));
    request.del(requestOptions, commonCallback([200], cb));
  }

  function _undeployProxy(options, cb){
    return _undeployAsset(options, 'apiproxy', cb);
  }

  function _undeploySharedFlow(options, cb) {
    return _undeployAsset(options, 'sharedflowbundle', cb);
  }

  function walkDirectory(dir, done) {
    var results = [];
    fs.readdir(dir, function(err, list) {
      if (err) return done(err);
      var i = 0;
      (function next() {
        var file = list[i++];
        if (!file) return done(null, results);
        file = dir + '/' + file;
        fs.stat(file, function(err, stat) {
          if (stat && stat.isDirectory()) {
            walkDirectory(file, function(err, res) {
              results = results.concat(res);
              next();
            });
          } else {
            results.push(file);
            next();
          }
        });
      })();
    });
  }

  function produceBundleZip(srcDir, assetType, cb) {
    var pathToZip = path.resolve(path.join(srcDir, assetType));
    var checkName = function(name) {
          if (name.endsWith('~')) return false;
          var b = path.basename(name);
          if (b.endsWith('#') && b.startsWith('#')) return false;
          return true;
        };
    if ( ! fs.existsSync(pathToZip)) {
      cb(new Error('The directory ' + pathToZip + ' does not exist'));
    }
    var tmpdir = process.env.tmpdir || '/tmp';
    var archiveName = path.join(tmpdir, assetType + '-' + new Date().getTime() + '.zip');
    var os = fs.createWriteStream(archiveName);
    var archive = archiver('zip');

    os.on('close', function () {
      common.logWrite('zipped ' + archive.pointer() + ' total bytes');
      cb(null, archiveName);
    });

    archive.on('error', function(e){ cb(e, archiveName); });
    archive.pipe(os);

    walkDirectory(pathToZip, function(e, results) {
      results.forEach(function(filename) {
        if (checkName(filename)) {
          var shortName = filename.replace(pathToZip, assetType);
          archive.append(fs.createReadStream(filename), { name: shortName });
          //console.log(shortName);
        }
      });
      archive.finalize();
    });
  }

  function getCollectionForAssetType(assetType) {
    var supportedTypes = { apiproxy: 'apis', sharedflowbundle: 'sharedflows'};
    return supportedTypes[assetType];
  }

  function internalImportBundleFromZip(assetName, assetType, zipArchive, cb) {
    // eg,
    // curl -X POST -H Content-Type:application/octet-stream "${mgmtserver}/v1/o/$org/apis?action=import&name=$proxyname" -T $zipname
    // or
    // curl -X POST -H content-type:application/octet-stream "${mgmtserver}/v1/o/$org/sharedflows?action=import&name=$sfname" -T $zipname
    if ( ! fs.existsSync(zipArchive)) {
      return cb(new Error('The archive does not exist'));
    }
    var collection = getCollectionForAssetType(assetType);
    if ( ! collection) {
      return cb(new Error('The assetType is not supported'));
    }

    var requestOptions = merge(true, gRequestOptions);
    requestOptions.headers['content-type'] = 'application/octet-stream';

    requestOptions.url = common.joinUrlElements(gUrlBase, collection + '?action=import&name=' + assetName);

    common.logWrite(sprintf('POST %s', requestOptions.url));

    fs.createReadStream(zipArchive)
      .pipe(request.post(requestOptions, commonCallback([201], cb)));
  }


  function _importAssetFromDir(name, srcDir, assetType, cb) {
    if (['apiproxy', 'sharedflowbundle'].indexOf(assetType) < 0) {
      return cb(new Error("unknown assetType"));
    }
    common.logWrite(sprintf('import %s %s from dir %s', assetType, name, path.resolve(srcDir)));
    produceBundleZip(srcDir, assetType, function(e, archiveName) {
      if (e) return cb(e);

      internalImportBundleFromZip(name, assetType, archiveName, function(e, result) {
        if (e) return cb(e);
        fs.unlinkSync(archiveName);
        cb(null, result);
      });
    });
  }

  function _importProxyFromDir(proxyName, srcDir, cb) {
    return _importAssetFromDir(proxyName, srcDir, 'apiproxy', cb);
  }

  function _importSharedFlowFromDir(name, srcDir, cb) {
    return _importAssetFromDir(name, srcDir, 'sharedflowbundle', cb);
  }

  function _importProxyFromZip(proxyName, zipArchive, cb) {
    // curl -X POST "${mgmtserver}/v1/o/$org/apis?action=import&name=$proxyname" -T $zipname -H "Content-Type: application/octet-stream"
    common.logWrite(sprintf('import proxy %s from zip %s', proxyName, zipArchive));
    return internalImportBundleFromZip(proxyName, 'apiproxy', zipArchive, cb);
  }

  function _importSharedFlowFromZip(name, zipArchive, cb) {
    // curl -X POST "${mgmtserver}/v1/o/$org/sharedflows?action=import&name=$sfname" -T $zipname -H "Content-Type: application/octet-stream"
    common.logWrite(sprintf('import sharedflow %s from zip %s', name, zipArchive));
    return internalImportBundleFromZip(name, 'sharedflow', zipArchive, cb);
  }

  function internalGetEnvironments(cb) {
    var requestOptions = merge(true, gRequestOptions);
    requestOptions.url = common.joinUrlElements(gUrlBase, 'e');
    common.logWrite(sprintf('GET %s', requestOptions.url));
    request.get(requestOptions, commonCallback([200], cb));
  }

  function _getEnvironments(cb) {
    common.logWrite('get environments');
    internalGetEnvironments(cb);
  }

  function resolveKvmPath(options) {
    if (options && options.env) {
      return common.joinUrlElements(gUrlBase, 'e', options.env, 'keyvaluemaps');
    }
    if (options && options.proxy) {
      return common.joinUrlElements(gUrlBase, 'apis', options.proxy, 'keyvaluemaps');
    }
    return common.joinUrlElements(gUrlBase, 'keyvaluemaps');
  }

  function _getKvms(options, cb) {
    var requestOptions = merge(true, gRequestOptions);
    requestOptions.url = resolveKvmPath(options);
    common.logWrite(sprintf('GET %s', requestOptions.url));
    request.get(requestOptions, commonCallback([200], cb));
  }

  function _checkProperties(cb) {
    return _get(gUrlBase, cb);
  }

  function transformToHash(properties) {
    var hash = {};
    properties.forEach(function(item) {
      hash[item.name] = item.value;
    });
    return hash;
  }

  function _putKvm(options, cb) {
    if ( ! gOrgProperties) {
      return _checkProperties(function(e, result) {
        if (e) {
          console.log(e);
          return cb(e, result);
        }
        gOrgProperties = transformToHash(result.properties.property);
        return _putKvm0(options, cb);
      });
    }
    else {
      return _putKvm0(options, cb);
    }
  }

  function _putKvm0(options, cb) {
    var requestOptions = merge(true, gRequestOptions);
    requestOptions.url = resolveKvmPath(options);

    if (gOrgProperties['features.isCpsEnabled']) {
      requestOptions.url = common.joinUrlElements(requestOptions.url, options.kvm, 'entries', options.key);
      common.logWrite(sprintf('GET %s', requestOptions.url));
      request.get(requestOptions, function(error, response, body) {
        if (error) {
          common.logWrite(error);
          return cb(error, body);
        }
        requestOptions.url = resolveKvmPath(options);
        requestOptions.url = common.joinUrlElements(requestOptions.url, options.kvm, 'entries');

        if (response.statusCode == 200) {
          // Update is required if the key already exists.
          common.logWrite('update');
          requestOptions.url = common.joinUrlElements(requestOptions.url, options.key);
        }
        else if (response.statusCode == 404) {
          common.logWrite('create');
        }

        if ((response.statusCode == 200) || (response.statusCode == 404)) {
          //
          // POST :mgmtserver/v1/o/:orgname/e/:env/keyvaluemaps/:mapname/entries/key1
          // Authorization: :edge-auth
          // content-type: application/json
          //
          // {
          //    "name" : "key1",
          //    "value" : "value_one_updated"
          // }
          requestOptions.headers['content-type'] = 'application/json';
          requestOptions.body = JSON.stringify({ name: options.key, value : options.value });
          common.logWrite(sprintf('POST %s', requestOptions.url));
          request.post(requestOptions, commonCallback([200, 201], cb));
        }
        else {
          common.logWrite(body);
          cb({error: 'bad status', statusCode: response.statusCode });
        }
      });
    }
    else {
      // for non-CPS KVM, use a different model to add/update an entry.
      //
      // POST :mgmtserver/v1/o/:orgname/e/:env/keyvaluemaps/:mapname
      // Authorization: :edge-auth
      // content-type: application/json
      //
      // {
      //    "entry": [ {"name" : "key1", "value" : "value_one_updated" } ],
      //    "name" : "mapname"
      // }
      requestOptions.url = common.joinUrlElements(requestOptions.url, options.kvm);
      requestOptions.headers['content-type'] = 'application/json';
      requestOptions.body = JSON.stringify({ name: options.kvm, entry: [{ name: options.key, value : options.value }] });
      common.logWrite(sprintf('POST %s', requestOptions.url));
      request.post(requestOptions, commonCallback([200, 201], cb));
    }
  }

  function _createKvm(options, cb) {
    // POST :mgmtserver/v1/o/:orgname/e/:env/keyvaluemaps
    // Authorization: :edge-auth
    // Content-type: application/json
    //
    // {
    //  "encrypted" : "false",
    //  "name" : ":mapname",
    //   "entry" : [   {
    //     "name" : "key1",
    //     "value" : "value_one"
    //     }, ...
    //   ]
    // }

    common.logWrite(sprintf('Create KVM %s', options.name));

    var requestOptions = merge(true, gRequestOptions);
    requestOptions.url = resolveKvmPath(options);
    requestOptions.headers['content-type'] = 'application/json';
    requestOptions.body = JSON.stringify({
      encrypted : options.encrypted ? "true" : "false",
      name : options.name,
      entry : options.entries ? uglifyAttrs(options.entries) : []
    });
    common.logWrite(sprintf('POST %s', requestOptions.url));
    request.post(requestOptions, commonCallback([201], cb));
  }


  function reallyCreateProduct(options, cb) {
    common.logWrite(sprintf('Create API Product %s with proxy %s', options.productname, options.proxy));

    var requestOptions = merge(true, gRequestOptions);
    requestOptions.headers['content-type'] = 'application/json';
    requestOptions.url = common.joinUrlElements(gUrlBase, 'apiproducts');
    var prodAttributes = uglifyAttrs(merge(options.attributes, {
          "created by": "nodejs " + path.basename(process.argv[1])
        }));

    requestOptions.body = JSON.stringify({
      name : options.productname,
      proxies : [ options.proxy ],
      attributes : prodAttributes,
      approvalType : options.approvalType || "manual",
      displayName : options.productname,
      environments : options.envs
    });

    common.logWrite(sprintf('POST %s', requestOptions.url));
    request.post(requestOptions, commonCallback([201], cb));
  }


  function _createApiProduct(options, cb) {
    // POST :mgmtserver/v1/o/:orgname/apiproducts/:product
    // Content-Type: application/json
    // Authorization: :edge-auth
    //
    // {
    //   "name" : ":product",
    //   "attributes" : [ {"name": "created by", "value" : "emacs"} ],
    //   "approvalType" : "manual",
    //   "displayName" : ":product",
    //   "proxies" : ["proxy1", "proxy2"],
    //   "scopes" : ["read", "write", "something"],
    //   "environments" : [ "prod" ]
    // }
    if ( ! options.envs) {
      _getEnvironments(function(e, result) {
        reallyCreateProduct(merge(options, {envs: result}), cb);
      });
    }
    else {
      reallyCreateProduct(options, cb);
    }
  }


  function uglifyAttrs(hash) {
    return Object.keys(hash).map(function(key){
      return { name : key, value : hash[key]};
    });
  }

  function _createDeveloperApp(options, cb) {
    // var THIRTY_DAYS_IN_MS = 1000 * 60 * 60 * 24 * 30;
    // POST :e2emgmtserver/v1/o/dchiesa2/developers/Elaine@example.org/apps
    // Content-type: application/json
    // Authorization: :edge-auth-e2e
    //
    // {
    //   "attributes" : [ {
    //     "name" : "attrname",
    //     "value" : "attrvalue"
    //   } ],
    //   "apiProducts": [ "Manual-Approval-1" ],
    //   "keyExpiresIn" : "86400000",
    //   "name" : "ElaineApp2"
    // }

    common.logWrite(sprintf('Create App %s for %s', options.appName, options.developerEmail));

    var requestOptions = merge(true, gRequestOptions);
    requestOptions.headers['content-type'] = 'application/json';
    requestOptions.url = common.joinUrlElements(gUrlBase,
                                                'developers',options.developerEmail,
                                                'apps');
    var DEFAULT_EXPIRY = -1;
    var keyExpiresIn = DEFAULT_EXPIRY;
    if (options.expiry) {
      keyExpiresIn = resolveExpiry(options.expiry);
    }
    else {
      common.logWrite(sprintf('Using default expiry of %d', keyExpiresIn));
    }

    var appAttributes = uglifyAttrs(merge(options.attributes, {
          "created by": "nodejs " + path.basename(process.argv[1])
        }));

    requestOptions.body = JSON.stringify({
      attributes : appAttributes,
      apiProducts: [options.apiProduct],
      keyExpiresIn : keyExpiresIn,
      name: options.appName
    });

    common.logWrite(sprintf('POST %s', requestOptions.url));
    request.post(requestOptions, commonCallback([201], cb));
  }


  function _createDeveloper(options, cb) {
    // POST :mgmtserver/v1/o/:orgname/developers
    // Authorization: :edge-auth
    // Content-type: application/json
    //
    // {
    //   "attributes": [ {
    //     "name" : "tag1",
    //     "value" : "whatever you like" }],
    //   "status": "active",
    //   "userName": "test-3a-HiDxfHvHrB",
    //   "lastName": "Martino",
    //   "firstName": "Dino",
    //   "email": "tet-3a-HiDxfHvHrB@apigee.com"
    // }

    common.logWrite(sprintf('Create Developer %s', options.developerEmail));

    var requestOptions = merge(true, gRequestOptions);
    requestOptions.headers['content-type'] = 'application/json';
    requestOptions.url = common.joinUrlElements(gUrlBase, 'developers');

    var devAttributes = uglifyAttrs(merge(options.attributes, {
          "created by": "nodejs " + path.basename(process.argv[1])
        }));

    requestOptions.body = JSON.stringify({
      attributes : devAttributes,
      userName : options.userName,
      firstName : options.firstName,
      lastName : options.lastName,
      email: options.developerEmail
    });
    common.logWrite(sprintf('POST %s', requestOptions.url));
    request.post(requestOptions, commonCallback([201], cb));
  }

  function _deleteDeveloper(options, cb) {
    // DELETE :mgmtserver/v1/o/:orgname/developers/:developer
    // Authorization: :edge-auth
    common.logWrite(sprintf('Delete Developer %s', options.developerEmail));
    var requestOptions = merge(true, gRequestOptions);
    requestOptions.url = common.joinUrlElements(gUrlBase, 'developers', options.developerEmail);
    common.logWrite(sprintf('DELETE %s', requestOptions.url));
    request.del(requestOptions, commonCallback([200], cb));
  }

  function _deleteDeveloperApp(options, cb) {
    // DELETE :mgmtserver/v1/o/:orgname/developers/:developer/apps/:appname
    // Authorization: :edge-auth
    common.logWrite(sprintf('Delete App %s for Developer %s', options.appName, options.developerEmail));
    var requestOptions = merge(true, gRequestOptions);
    requestOptions.url = common.joinUrlElements(gUrlBase, 'developers', options.developerEmail, 'apps', options.appName);
    common.logWrite(sprintf('DELETE %s', requestOptions.url));
    request.del(requestOptions, commonCallback([200], cb));
  }

  function _deleteApiProduct(options, cb) {
    // DELETE :mgmtserver/v1/o/:orgname/apiproducts/:apiproductname
    // Authorization: :edge-auth
    common.logWrite(sprintf('Delete API Product %s', options.productName));
    var requestOptions = merge(true, gRequestOptions);
    requestOptions.url = common.joinUrlElements(gUrlBase, 'apiproducts', options.productName);
    common.logWrite(sprintf('DELETE %s', requestOptions.url));
    request.del(requestOptions, commonCallback([200], cb));
  }

  function _getCaches(options, cb) {
    var requestOptions = merge(true, gRequestOptions);
    requestOptions.url = common.joinUrlElements(gUrlBase, 'e', options.env, 'caches');
    common.logWrite(sprintf('GET %s', requestOptions.url));
    request.get(requestOptions, commonCallback([200], cb));
  }

  function _createCache(options, cb) {
    // POST :mgmtserver/v1/o/:orgname/e/:env/caches?name=xxxxx
    // Authorization: :edge-auth
    // Content-type: application/json
    //
    // { .... }

    common.logWrite(sprintf('Create Cache %s', options.name));

    var requestOptions = merge(true, gRequestOptions);
    if (!options.env) {
      return cb({error:"missing environment name for cache"});
    }
    requestOptions.url = common.joinUrlElements(gUrlBase, 'e', options.env, 'caches') + '?name=' + options.name;
    requestOptions.headers['content-type'] = 'application/json';
    requestOptions.body = JSON.stringify({
      description: "cache for general purpose use",
      distributed : true,
      expirySettings: {
        timeoutInSec : { value : 86400 },
        valuesNull: false
      },
      compression: {
        minimumSizeInKB: 1024
      },
      persistent: false,
      skipCacheIfElementSizeInKBExceeds: "2048",
      diskSizeInMB: 0,
      overflowToDisk: false,
      maxElementsOnDisk: 1,
      maxElementsInMemory: 3000000,
      inMemorySizeInKB: 8000
    });
    common.logWrite(sprintf('POST %s', requestOptions.url));
    request.post(requestOptions, commonCallback([201], cb));
  }

  function _deleteCache(options, cb) {
    // DELETE :mgmtserver/v1/o/:orgname/e/:env/caches/:cachename
    // Authorization: :edge-auth
    common.logWrite(sprintf('Delete Cache %s', options.name));
    if (!options.env) {
      return cb({error:"missing environment name for cache"});
    }
    var requestOptions = merge(true, gRequestOptions);
    requestOptions.url = common.joinUrlElements(gUrlBase, 'e', options.env, 'caches', options.name);
    common.logWrite(sprintf('DELETE %s', requestOptions.url));
    request.del(requestOptions, commonCallback([200], cb));
  }

  function _deleteKvm(options, cb) {
    // eg,
    // DELETE :mgmtserver/v1/o/:orgname/e/:env/keyvaluemaps/:kvmname
    // Authorization: :edge-auth
    common.logWrite(sprintf('Delete KVM %s', options.name));

    var requestOptions = merge(true, gRequestOptions);
    requestOptions.url = resolveKvmPath(options);
    requestOptions.url = common.joinUrlElements(requestOptions.url, options.name);
    common.logWrite(sprintf('DELETE %s', requestOptions.url));
    request.del(requestOptions, commonCallback([200], cb));
  }

  module.exports = {
    setEdgeConnection       : _setEdgeConnection,
    get                     : _get,
    deployProxy             : _deployProxy,
    undeployProxy           : _undeployProxy,
    importProxyFromZip      : _importProxyFromZip,
    importProxyFromDir      : _importProxyFromDir,
    deploySharedFlow        : _deploySharedFlow,
    undeploySharedFlow      : _undeploySharedFlow,
    importSharedFlowFromDir : _importSharedFlowFromDir,
    importSharedFlowFromZip : _importSharedFlowFromZip,
    createApiProduct        : _createApiProduct,
    deleteApiProduct        : _deleteApiProduct,
    getCaches               : _getCaches,
    createCache             : _createCache,
    deleteCache             : _deleteCache,
    getEnvironments         : _getEnvironments,
    getKvms                 : _getKvms,
    createKvm               : _createKvm,
    deleteKvm               : _deleteKvm,
    putKvm                  : _putKvm,
    createDeveloperApp      : _createDeveloperApp,
    deleteDeveloperApp      : _deleteDeveloperApp,
    createDeveloper         : _createDeveloper,
    deleteDeveloper         : _deleteDeveloper
  };

}());
