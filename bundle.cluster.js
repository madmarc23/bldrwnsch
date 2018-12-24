(function () {
  'use strict';

  (function(self) {

    if (self.fetch) {
      return
    }

    var support = {
      searchParams: 'URLSearchParams' in self,
      iterable: 'Symbol' in self && 'iterator' in Symbol,
      blob: 'FileReader' in self && 'Blob' in self && (function() {
        try {
          new Blob();
          return true
        } catch(e) {
          return false
        }
      })(),
      formData: 'FormData' in self,
      arrayBuffer: 'ArrayBuffer' in self
    };

    if (support.arrayBuffer) {
      var viewClasses = [
        '[object Int8Array]',
        '[object Uint8Array]',
        '[object Uint8ClampedArray]',
        '[object Int16Array]',
        '[object Uint16Array]',
        '[object Int32Array]',
        '[object Uint32Array]',
        '[object Float32Array]',
        '[object Float64Array]'
      ];

      var isDataView = function(obj) {
        return obj && DataView.prototype.isPrototypeOf(obj)
      };

      var isArrayBufferView = ArrayBuffer.isView || function(obj) {
        return obj && viewClasses.indexOf(Object.prototype.toString.call(obj)) > -1
      };
    }

    function normalizeName(name) {
      if (typeof name !== 'string') {
        name = String(name);
      }
      if (/[^a-z0-9\-#$%&'*+.\^_`|~]/i.test(name)) {
        throw new TypeError('Invalid character in header field name')
      }
      return name.toLowerCase()
    }

    function normalizeValue(value) {
      if (typeof value !== 'string') {
        value = String(value);
      }
      return value
    }

    // Build a destructive iterator for the value list
    function iteratorFor(items) {
      var iterator = {
        next: function() {
          var value = items.shift();
          return {done: value === undefined, value: value}
        }
      };

      if (support.iterable) {
        iterator[Symbol.iterator] = function() {
          return iterator
        };
      }

      return iterator
    }

    function Headers(headers) {
      this.map = {};

      if (headers instanceof Headers) {
        headers.forEach(function(value, name) {
          this.append(name, value);
        }, this);
      } else if (Array.isArray(headers)) {
        headers.forEach(function(header) {
          this.append(header[0], header[1]);
        }, this);
      } else if (headers) {
        Object.getOwnPropertyNames(headers).forEach(function(name) {
          this.append(name, headers[name]);
        }, this);
      }
    }

    Headers.prototype.append = function(name, value) {
      name = normalizeName(name);
      value = normalizeValue(value);
      var oldValue = this.map[name];
      this.map[name] = oldValue ? oldValue+','+value : value;
    };

    Headers.prototype['delete'] = function(name) {
      delete this.map[normalizeName(name)];
    };

    Headers.prototype.get = function(name) {
      name = normalizeName(name);
      return this.has(name) ? this.map[name] : null
    };

    Headers.prototype.has = function(name) {
      return this.map.hasOwnProperty(normalizeName(name))
    };

    Headers.prototype.set = function(name, value) {
      this.map[normalizeName(name)] = normalizeValue(value);
    };

    Headers.prototype.forEach = function(callback, thisArg) {
      for (var name in this.map) {
        if (this.map.hasOwnProperty(name)) {
          callback.call(thisArg, this.map[name], name, this);
        }
      }
    };

    Headers.prototype.keys = function() {
      var items = [];
      this.forEach(function(value, name) { items.push(name); });
      return iteratorFor(items)
    };

    Headers.prototype.values = function() {
      var items = [];
      this.forEach(function(value) { items.push(value); });
      return iteratorFor(items)
    };

    Headers.prototype.entries = function() {
      var items = [];
      this.forEach(function(value, name) { items.push([name, value]); });
      return iteratorFor(items)
    };

    if (support.iterable) {
      Headers.prototype[Symbol.iterator] = Headers.prototype.entries;
    }

    function consumed(body) {
      if (body.bodyUsed) {
        return Promise.reject(new TypeError('Already read'))
      }
      body.bodyUsed = true;
    }

    function fileReaderReady(reader) {
      return new Promise(function(resolve, reject) {
        reader.onload = function() {
          resolve(reader.result);
        };
        reader.onerror = function() {
          reject(reader.error);
        };
      })
    }

    function readBlobAsArrayBuffer(blob) {
      var reader = new FileReader();
      var promise = fileReaderReady(reader);
      reader.readAsArrayBuffer(blob);
      return promise
    }

    function readBlobAsText(blob) {
      var reader = new FileReader();
      var promise = fileReaderReady(reader);
      reader.readAsText(blob);
      return promise
    }

    function readArrayBufferAsText(buf) {
      var view = new Uint8Array(buf);
      var chars = new Array(view.length);

      for (var i = 0; i < view.length; i++) {
        chars[i] = String.fromCharCode(view[i]);
      }
      return chars.join('')
    }

    function bufferClone(buf) {
      if (buf.slice) {
        return buf.slice(0)
      } else {
        var view = new Uint8Array(buf.byteLength);
        view.set(new Uint8Array(buf));
        return view.buffer
      }
    }

    function Body() {
      this.bodyUsed = false;

      this._initBody = function(body) {
        this._bodyInit = body;
        if (!body) {
          this._bodyText = '';
        } else if (typeof body === 'string') {
          this._bodyText = body;
        } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
          this._bodyBlob = body;
        } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
          this._bodyFormData = body;
        } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
          this._bodyText = body.toString();
        } else if (support.arrayBuffer && support.blob && isDataView(body)) {
          this._bodyArrayBuffer = bufferClone(body.buffer);
          // IE 10-11 can't handle a DataView body.
          this._bodyInit = new Blob([this._bodyArrayBuffer]);
        } else if (support.arrayBuffer && (ArrayBuffer.prototype.isPrototypeOf(body) || isArrayBufferView(body))) {
          this._bodyArrayBuffer = bufferClone(body);
        } else {
          throw new Error('unsupported BodyInit type')
        }

        if (!this.headers.get('content-type')) {
          if (typeof body === 'string') {
            this.headers.set('content-type', 'text/plain;charset=UTF-8');
          } else if (this._bodyBlob && this._bodyBlob.type) {
            this.headers.set('content-type', this._bodyBlob.type);
          } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
            this.headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
          }
        }
      };

      if (support.blob) {
        this.blob = function() {
          var rejected = consumed(this);
          if (rejected) {
            return rejected
          }

          if (this._bodyBlob) {
            return Promise.resolve(this._bodyBlob)
          } else if (this._bodyArrayBuffer) {
            return Promise.resolve(new Blob([this._bodyArrayBuffer]))
          } else if (this._bodyFormData) {
            throw new Error('could not read FormData body as blob')
          } else {
            return Promise.resolve(new Blob([this._bodyText]))
          }
        };

        this.arrayBuffer = function() {
          if (this._bodyArrayBuffer) {
            return consumed(this) || Promise.resolve(this._bodyArrayBuffer)
          } else {
            return this.blob().then(readBlobAsArrayBuffer)
          }
        };
      }

      this.text = function() {
        var rejected = consumed(this);
        if (rejected) {
          return rejected
        }

        if (this._bodyBlob) {
          return readBlobAsText(this._bodyBlob)
        } else if (this._bodyArrayBuffer) {
          return Promise.resolve(readArrayBufferAsText(this._bodyArrayBuffer))
        } else if (this._bodyFormData) {
          throw new Error('could not read FormData body as text')
        } else {
          return Promise.resolve(this._bodyText)
        }
      };

      if (support.formData) {
        this.formData = function() {
          return this.text().then(decode)
        };
      }

      this.json = function() {
        return this.text().then(JSON.parse)
      };

      return this
    }

    // HTTP methods whose capitalization should be normalized
    var methods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT'];

    function normalizeMethod(method) {
      var upcased = method.toUpperCase();
      return (methods.indexOf(upcased) > -1) ? upcased : method
    }

    function Request(input, options) {
      options = options || {};
      var body = options.body;

      if (input instanceof Request) {
        if (input.bodyUsed) {
          throw new TypeError('Already read')
        }
        this.url = input.url;
        this.credentials = input.credentials;
        if (!options.headers) {
          this.headers = new Headers(input.headers);
        }
        this.method = input.method;
        this.mode = input.mode;
        if (!body && input._bodyInit != null) {
          body = input._bodyInit;
          input.bodyUsed = true;
        }
      } else {
        this.url = String(input);
      }

      this.credentials = options.credentials || this.credentials || 'omit';
      if (options.headers || !this.headers) {
        this.headers = new Headers(options.headers);
      }
      this.method = normalizeMethod(options.method || this.method || 'GET');
      this.mode = options.mode || this.mode || null;
      this.referrer = null;

      if ((this.method === 'GET' || this.method === 'HEAD') && body) {
        throw new TypeError('Body not allowed for GET or HEAD requests')
      }
      this._initBody(body);
    }

    Request.prototype.clone = function() {
      return new Request(this, { body: this._bodyInit })
    };

    function decode(body) {
      var form = new FormData();
      body.trim().split('&').forEach(function(bytes) {
        if (bytes) {
          var split = bytes.split('=');
          var name = split.shift().replace(/\+/g, ' ');
          var value = split.join('=').replace(/\+/g, ' ');
          form.append(decodeURIComponent(name), decodeURIComponent(value));
        }
      });
      return form
    }

    function parseHeaders(rawHeaders) {
      var headers = new Headers();
      // Replace instances of \r\n and \n followed by at least one space or horizontal tab with a space
      // https://tools.ietf.org/html/rfc7230#section-3.2
      var preProcessedHeaders = rawHeaders.replace(/\r?\n[\t ]+/g, ' ');
      preProcessedHeaders.split(/\r?\n/).forEach(function(line) {
        var parts = line.split(':');
        var key = parts.shift().trim();
        if (key) {
          var value = parts.join(':').trim();
          headers.append(key, value);
        }
      });
      return headers
    }

    Body.call(Request.prototype);

    function Response(bodyInit, options) {
      if (!options) {
        options = {};
      }

      this.type = 'default';
      this.status = options.status === undefined ? 200 : options.status;
      this.ok = this.status >= 200 && this.status < 300;
      this.statusText = 'statusText' in options ? options.statusText : 'OK';
      this.headers = new Headers(options.headers);
      this.url = options.url || '';
      this._initBody(bodyInit);
    }

    Body.call(Response.prototype);

    Response.prototype.clone = function() {
      return new Response(this._bodyInit, {
        status: this.status,
        statusText: this.statusText,
        headers: new Headers(this.headers),
        url: this.url
      })
    };

    Response.error = function() {
      var response = new Response(null, {status: 0, statusText: ''});
      response.type = 'error';
      return response
    };

    var redirectStatuses = [301, 302, 303, 307, 308];

    Response.redirect = function(url, status) {
      if (redirectStatuses.indexOf(status) === -1) {
        throw new RangeError('Invalid status code')
      }

      return new Response(null, {status: status, headers: {location: url}})
    };

    self.Headers = Headers;
    self.Request = Request;
    self.Response = Response;

    self.fetch = function(input, init) {
      return new Promise(function(resolve, reject) {
        var request = new Request(input, init);
        var xhr = new XMLHttpRequest();

        xhr.onload = function() {
          var options = {
            status: xhr.status,
            statusText: xhr.statusText,
            headers: parseHeaders(xhr.getAllResponseHeaders() || '')
          };
          options.url = 'responseURL' in xhr ? xhr.responseURL : options.headers.get('X-Request-URL');
          var body = 'response' in xhr ? xhr.response : xhr.responseText;
          resolve(new Response(body, options));
        };

        xhr.onerror = function() {
          reject(new TypeError('Network request failed'));
        };

        xhr.ontimeout = function() {
          reject(new TypeError('Network request failed'));
        };

        xhr.open(request.method, request.url, true);

        if (request.credentials === 'include') {
          xhr.withCredentials = true;
        } else if (request.credentials === 'omit') {
          xhr.withCredentials = false;
        }

        if ('responseType' in xhr && support.blob) {
          xhr.responseType = 'blob';
        }

        request.headers.forEach(function(value, name) {
          xhr.setRequestHeader(name, value);
        });

        xhr.send(typeof request._bodyInit === 'undefined' ? null : request._bodyInit);
      })
    };
    self.fetch.polyfill = true;
  })(typeof self !== 'undefined' ? self : undefined);

  var sort = sortKD;

  function sortKD(ids, coords, nodeSize, left, right, depth) {
      if (right - left <= nodeSize) return;

      var m = Math.floor((left + right) / 2);

      select(ids, coords, m, left, right, depth % 2);

      sortKD(ids, coords, nodeSize, left, m - 1, depth + 1);
      sortKD(ids, coords, nodeSize, m + 1, right, depth + 1);
  }

  function select(ids, coords, k, left, right, inc) {

      while (right > left) {
          if (right - left > 600) {
              var n = right - left + 1;
              var m = k - left + 1;
              var z = Math.log(n);
              var s = 0.5 * Math.exp(2 * z / 3);
              var sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (m - n / 2 < 0 ? -1 : 1);
              var newLeft = Math.max(left, Math.floor(k - m * s / n + sd));
              var newRight = Math.min(right, Math.floor(k + (n - m) * s / n + sd));
              select(ids, coords, k, newLeft, newRight, inc);
          }

          var t = coords[2 * k + inc];
          var i = left;
          var j = right;

          swapItem(ids, coords, left, k);
          if (coords[2 * right + inc] > t) swapItem(ids, coords, left, right);

          while (i < j) {
              swapItem(ids, coords, i, j);
              i++;
              j--;
              while (coords[2 * i + inc] < t) i++;
              while (coords[2 * j + inc] > t) j--;
          }

          if (coords[2 * left + inc] === t) swapItem(ids, coords, left, j);
          else {
              j++;
              swapItem(ids, coords, j, right);
          }

          if (j <= k) left = j + 1;
          if (k <= j) right = j - 1;
      }
  }

  function swapItem(ids, coords, i, j) {
      swap(ids, i, j);
      swap(coords, 2 * i, 2 * j);
      swap(coords, 2 * i + 1, 2 * j + 1);
  }

  function swap(arr, i, j) {
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
  }

  var range_1 = range;

  function range(ids, coords, minX, minY, maxX, maxY, nodeSize) {
      var stack = [0, ids.length - 1, 0];
      var result = [];
      var x, y;

      while (stack.length) {
          var axis = stack.pop();
          var right = stack.pop();
          var left = stack.pop();

          if (right - left <= nodeSize) {
              for (var i = left; i <= right; i++) {
                  x = coords[2 * i];
                  y = coords[2 * i + 1];
                  if (x >= minX && x <= maxX && y >= minY && y <= maxY) result.push(ids[i]);
              }
              continue;
          }

          var m = Math.floor((left + right) / 2);

          x = coords[2 * m];
          y = coords[2 * m + 1];

          if (x >= minX && x <= maxX && y >= minY && y <= maxY) result.push(ids[m]);

          var nextAxis = (axis + 1) % 2;

          if (axis === 0 ? minX <= x : minY <= y) {
              stack.push(left);
              stack.push(m - 1);
              stack.push(nextAxis);
          }
          if (axis === 0 ? maxX >= x : maxY >= y) {
              stack.push(m + 1);
              stack.push(right);
              stack.push(nextAxis);
          }
      }

      return result;
  }

  var within_1 = within;

  function within(ids, coords, qx, qy, r, nodeSize) {
      var stack = [0, ids.length - 1, 0];
      var result = [];
      var r2 = r * r;

      while (stack.length) {
          var axis = stack.pop();
          var right = stack.pop();
          var left = stack.pop();

          if (right - left <= nodeSize) {
              for (var i = left; i <= right; i++) {
                  if (sqDist(coords[2 * i], coords[2 * i + 1], qx, qy) <= r2) result.push(ids[i]);
              }
              continue;
          }

          var m = Math.floor((left + right) / 2);

          var x = coords[2 * m];
          var y = coords[2 * m + 1];

          if (sqDist(x, y, qx, qy) <= r2) result.push(ids[m]);

          var nextAxis = (axis + 1) % 2;

          if (axis === 0 ? qx - r <= x : qy - r <= y) {
              stack.push(left);
              stack.push(m - 1);
              stack.push(nextAxis);
          }
          if (axis === 0 ? qx + r >= x : qy + r >= y) {
              stack.push(m + 1);
              stack.push(right);
              stack.push(nextAxis);
          }
      }

      return result;
  }

  function sqDist(ax, ay, bx, by) {
      var dx = ax - bx;
      var dy = ay - by;
      return dx * dx + dy * dy;
  }

  var kdbush_1 = kdbush;

  function kdbush(points, getX, getY, nodeSize, ArrayType) {
      return new KDBush(points, getX, getY, nodeSize, ArrayType);
  }

  function KDBush(points, getX, getY, nodeSize, ArrayType) {
      getX = getX || defaultGetX;
      getY = getY || defaultGetY;
      ArrayType = ArrayType || Array;

      this.nodeSize = nodeSize || 64;
      this.points = points;

      this.ids = new ArrayType(points.length);
      this.coords = new ArrayType(points.length * 2);

      for (var i = 0; i < points.length; i++) {
          this.ids[i] = i;
          this.coords[2 * i] = getX(points[i]);
          this.coords[2 * i + 1] = getY(points[i]);
      }

      sort(this.ids, this.coords, this.nodeSize, 0, this.ids.length - 1, 0);
  }

  KDBush.prototype = {
      range: function (minX, minY, maxX, maxY) {
          return range_1(this.ids, this.coords, minX, minY, maxX, maxY, this.nodeSize);
      },

      within: function (x, y, r) {
          return within_1(this.ids, this.coords, x, y, r, this.nodeSize);
      }
  };

  function defaultGetX(p) { return p[0]; }
  function defaultGetY(p) { return p[1]; }

  var supercluster_1 = supercluster;
  var default_1 = supercluster;

  function supercluster(options) {
      return new SuperCluster(options);
  }

  function SuperCluster(options) {
      this.options = extend(Object.create(this.options), options);
      this.trees = new Array(this.options.maxZoom + 1);
  }

  SuperCluster.prototype = {
      options: {
          minZoom: 0,   // min zoom to generate clusters on
          maxZoom: 16,  // max zoom level to cluster the points on
          radius: 40,   // cluster radius in pixels
          extent: 512,  // tile extent (radius is calculated relative to it)
          nodeSize: 64, // size of the KD-tree leaf node, affects performance
          log: false,   // whether to log timing info

          // a reduce function for calculating custom cluster properties
          reduce: null, // function (accumulated, props) { accumulated.sum += props.sum; }

          // initial properties of a cluster (before running the reducer)
          initial: function () { return {}; }, // function () { return {sum: 0}; },

          // properties to use for individual points when running the reducer
          map: function (props) { return props; } // function (props) { return {sum: props.my_value}; },
      },

      load: function (points) {
          var log = this.options.log;

          if (log) console.time('total time');

          var timerId = 'prepare ' + points.length + ' points';
          if (log) console.time(timerId);

          this.points = points;

          // generate a cluster object for each point and index input points into a KD-tree
          var clusters = [];
          for (var i = 0; i < points.length; i++) {
              if (!points[i].geometry) {
                  continue;
              }
              clusters.push(createPointCluster(points[i], i));
          }
          this.trees[this.options.maxZoom + 1] = kdbush_1(clusters, getX, getY, this.options.nodeSize, Float32Array);

          if (log) console.timeEnd(timerId);

          // cluster points on max zoom, then cluster the results on previous zoom, etc.;
          // results in a cluster hierarchy across zoom levels
          for (var z = this.options.maxZoom; z >= this.options.minZoom; z--) {
              var now = +Date.now();

              // create a new set of clusters for the zoom and index them with a KD-tree
              clusters = this._cluster(clusters, z);
              this.trees[z] = kdbush_1(clusters, getX, getY, this.options.nodeSize, Float32Array);

              if (log) console.log('z%d: %d clusters in %dms', z, clusters.length, +Date.now() - now);
          }

          if (log) console.timeEnd('total time');

          return this;
      },

      getClusters: function (bbox, zoom) {
          var minLng = ((bbox[0] + 180) % 360 + 360) % 360 - 180;
          var minLat = Math.max(-90, Math.min(90, bbox[1]));
          var maxLng = ((bbox[2] + 180) % 360 + 360) % 360 - 180;
          var maxLat = Math.max(-90, Math.min(90, bbox[3]));

          if (bbox[0] > bbox[2]) {
              var easternHem = this.getClusters([minLng, minLat, 180, maxLat], zoom);
              var westernHem = this.getClusters([-180, minLat, maxLng, maxLat], zoom);
              return easternHem.concat(westernHem);
          }

          var tree = this.trees[this._limitZoom(zoom)];
          var ids = tree.range(lngX(minLng), latY(maxLat), lngX(maxLng), latY(minLat));
          var clusters = [];
          for (var i = 0; i < ids.length; i++) {
              var c = tree.points[ids[i]];
              clusters.push(c.numPoints ? getClusterJSON(c) : this.points[c.id]);
          }
          return clusters;
      },

      getChildren: function (clusterId) {
          var originId = clusterId >> 5;
          var originZoom = clusterId % 32;
          var errorMsg = 'No cluster with the specified id.';

          var index = this.trees[originZoom];
          if (!index) throw new Error(errorMsg);

          var origin = index.points[originId];
          if (!origin) throw new Error(errorMsg);

          var r = this.options.radius / (this.options.extent * Math.pow(2, originZoom - 1));
          var ids = index.within(origin.x, origin.y, r);
          var children = [];
          for (var i = 0; i < ids.length; i++) {
              var c = index.points[ids[i]];
              if (c.parentId === clusterId) {
                  children.push(c.numPoints ? getClusterJSON(c) : this.points[c.id]);
              }
          }

          if (children.length === 0) throw new Error(errorMsg);

          return children;
      },

      getLeaves: function (clusterId, limit, offset) {
          limit = limit || 10;
          offset = offset || 0;

          var leaves = [];
          this._appendLeaves(leaves, clusterId, limit, offset, 0);

          return leaves;
      },

      getTile: function (z, x, y) {
          var tree = this.trees[this._limitZoom(z)];
          var z2 = Math.pow(2, z);
          var extent = this.options.extent;
          var r = this.options.radius;
          var p = r / extent;
          var top = (y - p) / z2;
          var bottom = (y + 1 + p) / z2;

          var tile = {
              features: []
          };

          this._addTileFeatures(
              tree.range((x - p) / z2, top, (x + 1 + p) / z2, bottom),
              tree.points, x, y, z2, tile);

          if (x === 0) {
              this._addTileFeatures(
                  tree.range(1 - p / z2, top, 1, bottom),
                  tree.points, z2, y, z2, tile);
          }
          if (x === z2 - 1) {
              this._addTileFeatures(
                  tree.range(0, top, p / z2, bottom),
                  tree.points, -1, y, z2, tile);
          }

          return tile.features.length ? tile : null;
      },

      getClusterExpansionZoom: function (clusterId) {
          var clusterZoom = (clusterId % 32) - 1;
          while (clusterZoom < this.options.maxZoom) {
              var children = this.getChildren(clusterId);
              clusterZoom++;
              if (children.length !== 1) break;
              clusterId = children[0].properties.cluster_id;
          }
          return clusterZoom;
      },

      _appendLeaves: function (result, clusterId, limit, offset, skipped) {
          var children = this.getChildren(clusterId);

          for (var i = 0; i < children.length; i++) {
              var props = children[i].properties;

              if (props && props.cluster) {
                  if (skipped + props.point_count <= offset) {
                      // skip the whole cluster
                      skipped += props.point_count;
                  } else {
                      // enter the cluster
                      skipped = this._appendLeaves(result, props.cluster_id, limit, offset, skipped);
                      // exit the cluster
                  }
              } else if (skipped < offset) {
                  // skip a single point
                  skipped++;
              } else {
                  // add a single point
                  result.push(children[i]);
              }
              if (result.length === limit) break;
          }

          return skipped;
      },

      _addTileFeatures: function (ids, points, x, y, z2, tile) {
          for (var i = 0; i < ids.length; i++) {
              var c = points[ids[i]];
              tile.features.push({
                  type: 1,
                  geometry: [[
                      Math.round(this.options.extent * (c.x * z2 - x)),
                      Math.round(this.options.extent * (c.y * z2 - y))
                  ]],
                  tags: c.numPoints ? getClusterProperties(c) : this.points[c.id].properties
              });
          }
      },

      _limitZoom: function (z) {
          return Math.max(this.options.minZoom, Math.min(z, this.options.maxZoom + 1));
      },

      _cluster: function (points, zoom) {
          var clusters = [];
          var r = this.options.radius / (this.options.extent * Math.pow(2, zoom));

          // loop through each point
          for (var i = 0; i < points.length; i++) {
              var p = points[i];
              // if we've already visited the point at this zoom level, skip it
              if (p.zoom <= zoom) continue;
              p.zoom = zoom;

              // find all nearby points
              var tree = this.trees[zoom + 1];
              var neighborIds = tree.within(p.x, p.y, r);

              var numPoints = p.numPoints || 1;
              var wx = p.x * numPoints;
              var wy = p.y * numPoints;

              var clusterProperties = null;

              if (this.options.reduce) {
                  clusterProperties = this.options.initial();
                  this._accumulate(clusterProperties, p);
              }

              // encode both zoom and point index on which the cluster originated
              var id = (i << 5) + (zoom + 1);

              for (var j = 0; j < neighborIds.length; j++) {
                  var b = tree.points[neighborIds[j]];
                  // filter out neighbors that are already processed
                  if (b.zoom <= zoom) continue;
                  b.zoom = zoom; // save the zoom (so it doesn't get processed twice)

                  var numPoints2 = b.numPoints || 1;
                  wx += b.x * numPoints2; // accumulate coordinates for calculating weighted center
                  wy += b.y * numPoints2;

                  numPoints += numPoints2;
                  b.parentId = id;

                  if (this.options.reduce) {
                      this._accumulate(clusterProperties, b);
                  }
              }

              if (numPoints === 1) {
                  clusters.push(p);
              } else {
                  p.parentId = id;
                  clusters.push(createCluster(wx / numPoints, wy / numPoints, id, numPoints, clusterProperties));
              }
          }

          return clusters;
      },

      _accumulate: function (clusterProperties, point) {
          var properties = point.numPoints ?
              point.properties :
              this.options.map(this.points[point.id].properties);

          this.options.reduce(clusterProperties, properties);
      }
  };

  function createCluster(x, y, id, numPoints, properties) {
      return {
          x: x, // weighted cluster center
          y: y,
          zoom: Infinity, // the last zoom the cluster was processed at
          id: id, // encodes index of the first child of the cluster and its zoom level
          parentId: -1, // parent cluster id
          numPoints: numPoints,
          properties: properties
      };
  }

  function createPointCluster(p, id) {
      var coords = p.geometry.coordinates;
      return {
          x: lngX(coords[0]), // projected point coordinates
          y: latY(coords[1]),
          zoom: Infinity, // the last zoom the point was processed at
          id: id, // index of the source feature in the original input array
          parentId: -1 // parent cluster id
      };
  }

  function getClusterJSON(cluster) {
      return {
          type: 'Feature',
          properties: getClusterProperties(cluster),
          geometry: {
              type: 'Point',
              coordinates: [xLng(cluster.x), yLat(cluster.y)]
          }
      };
  }

  function getClusterProperties(cluster) {
      var count = cluster.numPoints;
      var abbrev =
          count >= 10000 ? Math.round(count / 1000) + 'k' :
          count >= 1000 ? (Math.round(count / 100) / 10) + 'k' : count;
      return extend(extend({}, cluster.properties), {
          cluster: true,
          cluster_id: cluster.id,
          point_count: count,
          point_count_abbreviated: abbrev
      });
  }

  // longitude/latitude to spherical mercator in [0..1] range
  function lngX(lng) {
      return lng / 360 + 0.5;
  }
  function latY(lat) {
      var sin = Math.sin(lat * Math.PI / 180),
          y = (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
      return y < 0 ? 0 : y > 1 ? 1 : y;
  }

  // spherical mercator to longitude/latitude
  function xLng(x) {
      return (x - 0.5) * 360;
  }
  function yLat(y) {
      var y2 = (180 - y * 360) * Math.PI / 180;
      return 360 * Math.atan(Math.exp(y2)) / Math.PI - 90;
  }

  function extend(dest, src) {
      for (var id in src) dest[id] = src[id];
      return dest;
  }

  function getX(p) {
      return p.x;
  }
  function getY(p) {
      return p.y;
  }
  supercluster_1.default = default_1;

  var index = supercluster_1({
    radius: 24,
    extent: 256,
    maxZoom: 17
  });

  fetch('https://tools.wmflabs.org/bldrwnsch/Bilderwuensche.json.gz')
    .then(function(response) {
      if (!response.ok) {
        throw response.statusText;
      }
      return response.json();
    })
    .then(function(json) {
      var features = json.map(function(row) {
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [row.lon, row.lat]
          },
          properties: row
        };
      });
      return {
        type: 'FeatureCollection',
        features: features
      };
    })
    .then(function(geojson) {
      index.load(geojson.features);
      postMessage({ready: true});
    });

  self.onmessage = function(e) {
    if (e.data.getClusterExpansionZoom) {
      postMessage({
        expansionZoom: index.getClusterExpansionZoom(e.data.getClusterExpansionZoom),
        center: e.data.center
      });
    } else if (e.data) {
      postMessage(index.getClusters(e.data.bbox, e.data.zoom));
    }
  };

}());
