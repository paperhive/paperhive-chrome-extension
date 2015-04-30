'use strict';

var crypto = require('crypto');
var async = require('async');

// from <http://stackoverflow.com/a/21042958/353337>
var getHeaderFromHeaders = function(headers, headerName) {
  for (var i = 0; i < headers.length; ++i) {
    var header = headers[i];
    if (header.name.toLowerCase() === headerName) {
      return header;
    }
  }
};

global.tabToMimeType = {};
global.tabToArticle = {};
global.tabToDiscussions = {};

chrome.webRequest.onHeadersReceived.addListener(
  function(details) {
    if (details.tabId !== -1) {
      var header = getHeaderFromHeaders(
        details.responseHeaders,
        'content-type'
      );
      // If the header is set, use its value. Otherwise, use undefined.
      global.tabToMimeType[details.tabId] =
        header && header.value.split(';', 1)[0];
    }
  },
  {
    urls: ['*://*/*'],
    types: ['main_frame']
  },
  ['responseHeaders']
);

chrome.webRequest.onCompleted.addListener(
  function(details) {
    if (details.tabId !== -1) {
      var header = getHeaderFromHeaders(
        details.responseHeaders,
        'content-type'
      );
      // If the header is set, use its value. Otherwise, use undefined.
      global.tabToMimeType[details.tabId] =
        header && header.value.split(';', 1)[0];
    }

    // TODO put this into a config file
    var paperHive = 'https://paperhive.org/dev/backend/branches/master';

    if (global.tabToMimeType[details.tabId] === 'application/pdf') {
      // Replace icon, and do so with a delay. Otherwise it doesn't work
      // reliably, cf.
      // <https://code.google.com/p/chromium/issues/detail?id=123240>.
      setTimeout(function() {
        chrome.browserAction.setIcon({
          path: {
            '19': 'images/icon-19.png',
            '38': 'images/icon-38.png'
          },
          tabId: details.tabId
        });
      }, 100);
      async.waterfall([
        function getPdfHash(callback) {
          // Since we have no access to the PDF data, we have to
          // fetch it again and hope it gets served from cache.
          var xhr = new XMLHttpRequest();
          xhr.open('GET', details.url, true);
          xhr.responseType = 'blob';
          xhr.onload = function() {
            if (this.status === 200) {
              // read the blob data, cf.
              // <http://www.html5rocks.com/en/tutorials/file/xhr2/>
              var a = new FileReader();
              a.readAsBinaryString(this.response);
              a.onloadend = function() {
                var hash = crypto.createHash('sha1');
                hash.update(a.result, 'binary');
                callback(null, hash.digest('hex'));
              };
            } else {
              callback('Could not fetch PDF.');
            }
          };
          xhr.send(null);
        },
        function checkOnPaperhive(hash, callback) {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', paperHive + '/articles/bySha/' + hash, true);
          xhr.responseType = 'json';
          xhr.onload = function() {
            if (this.status === 200) {
              global.tabToArticle[details.tabId] = xhr.response;
              callback(null, xhr.response);
            } else if (this.status === 404) {
            } else {
              callback('Unexpected return value');
            }
          };
          xhr.send(null);
        },
        function fetchDiscussions(article, callback) {
          var xhr = new XMLHttpRequest();
          xhr.open(
            'GET',
            paperHive + '/articles/' + article._id + '/discussions/',
            true
          );
          xhr.responseType = 'json';
          xhr.onload = function() {
            if (this.status === 200) {
              global.tabToDiscussions[details.tabId] = xhr.response;
              var badge;
              if (xhr.response.length < 1) {
                badge = null;
              } else if (xhr.response.length < 1000) {
                badge = xhr.response.length.toString();
              } else {
                badge = '999+';
              }
              //chrome.browserAction.setBadgeBackgroundColor(
              //  {color: '#000000'}
              //);
              chrome.browserAction.setBadgeText({
                text: badge,
                tabId: details.tabId
              });
            } else {
              callback('Unexpected return value');
            }
          };
          xhr.send(null);
        }
      ]);
    }
  },
  {
    urls: ['*://*/*'],
    types: ['main_frame']
  },
  ['responseHeaders']
);
