'use strict';
(function() {
  var crypto = require('crypto');
  var async = require('async');
  var config = require('../../config.json');

  // from <http://stackoverflow.com/a/21042958/353337>
  var extractHeader = function(headers, headerName) {
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
      if (details.tabId >= 0) {
        var header = extractHeader(
          details.responseHeaders,
          'content-type'
        );
        // If the header is set, use its value. Otherwise, use undefined.
        global.tabToMimeType[details.tabId] =
          header && header.value.split(';', 1)[0];
        if (global.tabToMimeType[details.tabId] === 'application/pdf') {
          // set the page icon with a delay, see
          // <http://stackoverflow.com/a/30004730/353337>
          setTimeout(function() {
            chrome.pageAction.show(details.tabId);
          }, 100);
        }
      }
    },
    {
      urls: ['*://*/*.pdf'],
      types: ['main_frame']
    },
    ['responseHeaders']
  );

  var setColorIcon = function(tabId) {
    // Replace icon, and do so with a delay. Otherwise it doesn't work
    // reliably, cf.
    // <https://code.google.com/p/chromium/issues/detail?id=123240>.
    setTimeout(function() {
      chrome.pageAction.setIcon({
        path: {
          '19': 'images/icon-19.png',
          '38': 'images/icon-38.png'
        },
        tabId: tabId
      });
    }, 100);
  };

  // Chrome 42 doesn't properly fire chrome.webRequest.onCompleted/main_frame
  // when loading a PDF page. When it's served from cache, it does.
  // See <https://code.google.com/p/chromium/issues/detail?id=481411>.
  chrome.webRequest.onCompleted.addListener(
    function(details) {
      if (global.tabToMimeType[details.tabId] === 'application/pdf') {
        // URL parsing in JS: <https://gist.github.com/jlong/2428561>
        var parser = document.createElement('a');
        parser.href = details.url;
        var isWhitelistedSource = (parser.hostname === 'arxiv.org');

        if (isWhitelistedSource) {
          setColorIcon(details.tabId);
        }

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
            xhr.open('GET', config.apiUrl + '/articles/bySha/' + hash, true);
            xhr.responseType = 'json';
            xhr.onload = function() {
              if (this.status === 200) {
                global.tabToArticle[details.tabId] = xhr.response;
                // Set the icon to color.
                // This might have already been done above, we need to do it
                // here to account for PDFs which are in our system but the host
                // which serves it is not actually approved. This happens, for
                // example, if someone copies an arXiv article to another server.
                if (!isWhitelistedSource) {
                  setColorIcon(details.tabId);
                }
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
              config.apiUrl + '/articles/' + article._id + '/discussions/',
              true
            );
            xhr.responseType = 'json';
            xhr.onload = function() {
              if (this.status === 200) {
                global.tabToDiscussions[details.tabId] = xhr.response;
                // send message when page (and thus content script) is fully
                // loaded
                chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
                  if (changeInfo.status === 'complete') {
                    chrome.tabs.sendMessage(
                      details.tabId,
                      {
                        article: article,
                        discussions: xhr.response
                      }
                    );
                  }
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
      urls: ['*://*/*.pdf'],
      types: ['main_frame']
    },
    ['responseHeaders']
  );
})();
