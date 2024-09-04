// ==UserScript==
// @name        Expo EAS Build Log Export
// @namespace   Violentmonkey Scripts
// @match       https://expo.dev/accounts/*/projects/*/builds/*
// @grant       GM_xmlhttpRequest
// @version     0.4
// @author      likaci
// @description Export Expo EAS build logs and rename app files by version
// @license     MIT
// ==/UserScript==

(function () {
  'use strict';

  const originalFetch = unsafeWindow.fetch;
  unsafeWindow.fetch = function (url, options) {
    return originalFetch(url, options)
      .then(response => {
        if (url === 'https://api.expo.dev/graphql') {
          const responseClone = response.clone();
          responseClone.json().then(dataArray => {
            dataArray.forEach(data => {
              if (data.data && data.data.builds && data.data.builds.byId) {
                handleBuildData(data.data.builds.byId);
              } else {
                console.debug("Build data not found in response:", url);
              }
            });
          })
        }
        return response;
      });
  };

  function handleBuildData(buildData) {
    const {app, logFiles, artifacts, appVersion, appBuildVersion, buildProfile, platform} = buildData;
    const { slug } = app;
    const {applicationArchiveUrl, xcodeBuildLogsUrl} = artifacts;
    const filePrefix = `${appVersion}-${appBuildVersion}_${buildProfile}`;

    const installButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Install');
    if (!installButton) {
      console.error("Install button not found");
    } else {
      const targetDiv = installButton.parentNode;
      // Logs
      if (logFiles?.length > 0) {
        createDownloadButton(targetDiv, 'Logs', () => downloadLogs(logFiles, `logs_${platform.toLowerCase()}_${filePrefix}`));
      }

      // Xcode logs
      if (xcodeBuildLogsUrl) {
        createDownloadButton(targetDiv, 'Xcode Logs', () => downloadFile(xcodeBuildLogsUrl, `logs_xcode_${filePrefix}.log`));
      }

      // App
      if (applicationArchiveUrl) {
        createDownloadButton(targetDiv, 'App', () => {
          const extension = applicationArchiveUrl.split('.').pop();
          downloadFile(applicationArchiveUrl, `${slug}_${filePrefix}.${extension}`);
        });
      }
    }
  }

  function createDownloadButton(targetDiv, text, onclick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.className = 'border-solid rounded-md font-medium h-9 px-4 text-xs bg-button-primary text-button-primary hocus:bg-button-primary-hover';
    btn.onclick = onclick;
    targetDiv.appendChild(btn);
  }

  async function downloadLogs(logFiles, filePrefix) {
    const logsByPhase = {};
    for (const logFileUrl of logFiles) {
      try {
        const response = await fetch(logFileUrl);
        const text = await response.text();
        const lines = text.split('\n');
        lines.forEach(line => {
          try {
            const log = JSON.parse(line);
            const phase = log.phase;
            if (!logsByPhase[phase]) {
              logsByPhase[phase] = [];
            }
            logsByPhase[phase].push(`[${log.time}] ${log.msg}`);
          } catch (e) {
            console.error("Error parsing log line:", line, e);
          }
        });
      } catch (error) {
        console.error("Error fetching log file:", logFileUrl, error);
      }
    }

    let formattedLogs = "";
    for (const phase in logsByPhase) {
      formattedLogs += `=== ${phase} ===\n`;
      formattedLogs += logsByPhase[phase].join('\n');
      formattedLogs += '\n\n';
    }

    downloadBlob(new Blob([formattedLogs], {type: 'text/plain'}), `${filePrefix}.log`);
  }

  async function downloadFile(url, filename) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        responseType: "blob",
        onload: function(response) {
          resolve(response.response);
        },
        onerror: function(error) {
          reject(error);
        }
      });
    }).then(blob => {
      downloadBlob(blob, filename);
    });
  }

  function downloadBlob(blob, filename) {
    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }

})();