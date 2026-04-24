const DEFAULT_TIMEOUT_MIN = 5;
const CHECK_INTERVAL_MIN = 1;

// { tabId: lastActiveTimestamp }
const tabActivity = {};

// Record activity for a tab
function markActive(tabId) {
  tabActivity[tabId] = Date.now();
}

// On tab activated (user switches to it)
chrome.tabs.onActivated.addListener(({ tabId }) => {
  markActive(tabId);
});

// On tab updated (page load, navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    markActive(tabId);
  }
});

// On tab created
chrome.tabs.onCreated.addListener((tab) => {
  markActive(tab.id);
});

// On tab removed, clean up
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabActivity[tabId];
});

// Initialize: mark all existing tabs as active now
chrome.tabs.query({}, (tabs) => {
  for (const tab of tabs) {
    markActive(tab.id);
  }
});

// Periodic cleanup check
chrome.alarms.create("tabCleanup", { periodInMinutes: CHECK_INTERVAL_MIN });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "tabCleanup") return;

  const { exclusions = [], enabled = true, timeoutMin = DEFAULT_TIMEOUT_MIN } =
    await chrome.storage.local.get(["exclusions", "enabled", "timeoutMin"]);

  if (!enabled) return;

  const now = Date.now();
  const timeoutMs = timeoutMin * 60 * 1000;
  const tabs = await chrome.tabs.query({});

  // Never close the last tab in a window
  const windowTabCounts = {};
  for (const tab of tabs) {
    windowTabCounts[tab.windowId] = (windowTabCounts[tab.windowId] || 0) + 1;
  }

  // Find the currently active tab so we never close it
  const activeTabs = new Set();
  const windows = await chrome.windows.getAll();
  for (const win of windows) {
    const [active] = await chrome.tabs.query({
      active: true,
      windowId: win.id,
    });
    if (active) activeTabs.add(active.id);
  }

  for (const tab of tabs) {
    // Skip active tabs
    if (activeTabs.has(tab.id)) {
      markActive(tab.id);
      continue;
    }

    // Skip pinned tabs
    if (tab.pinned) continue;

    // Skip if it's the last tab in its window
    if (windowTabCounts[tab.windowId] <= 1) continue;

    // Skip excluded hosts
    if (tab.url) {
      try {
        const host = new URL(tab.url).hostname;
        if (
          exclusions.some(
            (ex) => host === ex || host.endsWith("." + ex)
          )
        ) {
          continue;
        }
      } catch {}
    }

    // Check inactivity
    const lastActive = tabActivity[tab.id] || 0;
    if (now - lastActive >= timeoutMs) {
      windowTabCounts[tab.windowId]--;
      // Save to closed history before removing
      saveClosedTab(tab);
      chrome.tabs.remove(tab.id);
      delete tabActivity[tab.id];
    }
  }
});

// Save closed tab to history
function saveClosedTab(tab) {
  if (!tab.url || tab.url.startsWith("chrome://")) return;
  chrome.storage.local.get(["closed_tabs"], (data) => {
    const closed = data.closed_tabs || [];
    closed.unshift({
      url: tab.url,
      title: tab.title || tab.url,
      favIconUrl: tab.favIconUrl || "",
      time: Date.now(),
    });
    if (closed.length > 50) closed.length = 50;
    chrome.storage.local.set({ closed_tabs: closed });
  });
}

// ═══════════════════════════════════
//  Redirect Tracer
// ═══════════════════════════════════
// { tabId: { chain: [{url, statusCode, statusLine}], finalUrl, finalStatus } }
const redirectData = {};

// When a new main-frame navigation starts, reset the chain
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  redirectData[details.tabId] = { chain: [], finalUrl: null, finalStatus: null };
});

// Capture each redirect hop
chrome.webRequest.onBeforeRedirect.addListener(
  (details) => {
    if (details.type !== "main_frame") return;
    if (!redirectData[details.tabId]) {
      redirectData[details.tabId] = { chain: [], finalUrl: null, finalStatus: null };
    }
    redirectData[details.tabId].chain.push({
      url: details.url,
      statusCode: details.statusCode,
      statusLine: details.statusLine || "",
      redirectUrl: details.redirectUrl,
    });
  },
  { urls: ["<all_urls>"] }
);

// Capture final completed request
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.type !== "main_frame") return;
    if (!redirectData[details.tabId]) {
      redirectData[details.tabId] = { chain: [], finalUrl: null, finalStatus: null };
    }
    redirectData[details.tabId].finalUrl = details.url;
    redirectData[details.tabId].finalStatus = details.statusCode;
  },
  { urls: ["<all_urls>"] }
);

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  delete redirectData[tabId];
});

// Respond to popup requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "getRedirects") {
    sendResponse(redirectData[msg.tabId] || { chain: [], finalUrl: null, finalStatus: null });
  }
  if (msg.type === "pip") {
    chrome.scripting.executeScript({
      target: { tabId: msg.tabId },
      func: () => {
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture();
          return { action: "exited" };
        }
        const videos = Array.from(document.querySelectorAll("video"));
        if (!videos.length) return { error: "No video found on this page" };
        const playing = videos.filter(v => !v.paused && !v.ended);
        let video;
        if (playing.length) {
          video = playing.reduce((a, b) =>
            (b.videoWidth * b.videoHeight) > (a.videoWidth * a.videoHeight) ? b : a
          );
        } else {
          video = videos.reduce((a, b) =>
            (b.videoWidth * b.videoHeight) > (a.videoWidth * a.videoHeight) ? b : a
          );
        }
        return video.requestPictureInPicture()
          .then(() => ({ action: "entered" }))
          .catch(e => ({ error: e.message }));
      },
    }).then(results => {
      sendResponse(results[0]?.result || { error: "No result" });
    }).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // async sendResponse
  }
});

// Set defaults on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["enabled", "timeoutMin", "exclusions"], (data) => {
    const defaults = {};
    if (data.enabled === undefined) defaults.enabled = true;
    if (data.timeoutMin === undefined) defaults.timeoutMin = DEFAULT_TIMEOUT_MIN;
    if (data.exclusions === undefined) defaults.exclusions = [];
    if (Object.keys(defaults).length) {
      chrome.storage.local.set(defaults);
    }
  });
});

// ═══════════════════════════════════
//  Regain - Focus & Blocking
// ═══════════════════════════════════
let regainBlockingActive = false;
let regainBlocklist = [];
let regainFocusSession = false;

// Daily limits tracking
let regainDailyLimits = {};
let regainUsageToday = {};
let regainLastResetDate = "";
let regainDeactivatedToday = [];
let regainActiveTabSite = null;
let regainActiveTabId = null;
let regainTrackingInterval = null;
let isTrackingInitialized = false;

const BLOCKED_RESPONSE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Blocked</title>
  <style>
    body { background: #1a1a2e; color: #e0e0e0; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .container { text-align: center; padding: 40px; }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { font-size: 24px; margin-bottom: 10px; }
    p { color: #888; font-size: 14px; }
    .timer { font-size: 48px; font-weight: 700; color: #e94560; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">⏱</div>
    <h1>Stay Focused!</h1>
    <p>This site is blocked during your focus session.</p>
  </div>
</body>
</html>
`;

function checkDailyLimitReached(site) {
  const limit = regainDailyLimits[site] || 0;
  const used = regainUsageToday[site] || 0;
  return limit > 0 && used >= limit;
}

function getSiteFromUrl(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return hostname;
  } catch {
    return null;
  }
}

function isBlockedSite(site) {
  if (!site || !regainBlocklist.length) return false;
  if (regainDeactivatedToday.includes(site)) return false;
  const normalizedSite = site.replace(/^www\./, '');
  return regainBlocklist.some(blocked => {
    const normalizedBlocked = blocked.replace(/^www\./, '');
    return normalizedSite === normalizedBlocked || 
           normalizedSite.endsWith('.' + normalizedBlocked) ||
           normalizedBlocked.endsWith('.' + normalizedSite);
  });
}

function startTrackingTab(tabId, site) {
  stopTrackingTab();
  
  console.log('[DEBUG] startTrackingTab:', { tabId, site, isBlocked: isBlockedSite(site), limit: regainDailyLimits[site], used: regainUsageToday[site] });
  
  if (!isBlockedSite(site)) return;
  
  regainActiveTabSite = site;
  regainActiveTabId = tabId;
  
  // Check if limit already reached (persistence check)
  if (checkDailyLimitReached(site)) {
    // Inject modal overlay with data
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (s, l, u) => {
        window.__regainSite = s;
        window.__regainLimit = l;
        window.__regainUsed = u;
      },
      args: [site, regainDailyLimits[site] || 0, regainUsageToday[site] || 0]
    }).then(() => {
      return chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['blocked-modal.js']
      });
    }).catch(() => {
      // Fallback to redirect
      chrome.tabs.update(tabId, {
        url: `blocked.html?site=${encodeURIComponent(site)}&limit=${regainDailyLimits[site]}&used=${regainUsageToday[site] || 0}&reason=limit`
      });
    });
    return;
  }
  
  regainTrackingInterval = setInterval(() => {
    const now = new Date();
    const today = now.toDateString();
    
    // Check midnight reset
    if (regainLastResetDate !== today) {
      resetDailyUsage();
      return;
    }
    
    // Increment usage by 1 second
    if (!regainUsageToday[site]) regainUsageToday[site] = 0;
    regainUsageToday[site]++;
    
    console.log('[DEBUG] Tick:', { 
      trackingSite: site, 
      regainActiveTabSite, 
      used: regainUsageToday[site], 
      limit: regainDailyLimits[site],
      reached: checkDailyLimitReached(site) 
    });
    
    chrome.storage.local.set({ regain_usageToday: regainUsageToday });
    
    // Send update to popup if open
    try {
      chrome.runtime.sendMessage({
        type: "regainUsageUpdate",
        usage: regainUsageToday,
        limits: regainDailyLimits
      });
    } catch (e) {}
    
    // Check if limit reached
    if (checkDailyLimitReached(site)) {
      console.log('[DEBUG] LIMIT REACHED - Showing modal overlay');
      stopTrackingTab();
      // Inject modal overlay with data
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (s, l, u) => {
          window.__regainSite = s;
          window.__regainLimit = l;
          window.__regainUsed = u;
        },
        args: [site, regainDailyLimits[site] || 0, regainUsageToday[site] || 0]
      }).then(() => {
        return chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['blocked-modal.js']
        });
      }).catch(err => {
        console.error('[Regain] Failed to inject modal:', err);
        // Fallback to redirect if injection fails
        chrome.tabs.update(tabId, {
          url: `blocked.html?site=${encodeURIComponent(site)}&limit=${regainDailyLimits[site]}&used=${regainUsageToday[site]}&reason=limit`
        });
      });
    }
  }, 1000); // Track every second
}

function stopTrackingTab() {
  if (regainTrackingInterval) {
    clearInterval(regainTrackingInterval);
    regainTrackingInterval = null;
  }
  regainActiveTabSite = null;
  regainActiveTabId = null;
}

function resetDailyUsage() {
  const now = new Date();
  regainLastResetDate = now.toDateString();
  regainUsageToday = {};
  regainDeactivatedToday = [];
  
  chrome.storage.local.set({
    regain_usageToday: {},
    regain_lastResetDate: regainLastResetDate,
    regain_deactivatedToday: []
  });
}

// Check all existing tabs on extension startup for blocked sites
async function checkExistingTabsOnStartup() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && tab.url.startsWith('http') && tab.active) {
        const site = getSiteFromUrl(tab.url);
        if (site && isBlockedSite(site) && checkDailyLimitReached(site)) {
          // Inject modal overlay with data
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (s, l, u) => {
              window.__regainSite = s;
              window.__regainLimit = l;
              window.__regainUsed = u;
            },
            args: [site, regainDailyLimits[site] || 0, regainUsageToday[site] || 0]
          }).then(() => {
            return chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['blocked-modal.js']
            });
          }).catch(() => {
            // Fallback to redirect
            chrome.tabs.update(tab.id, {
              url: `blocked.html?site=${encodeURIComponent(site)}&limit=${regainDailyLimits[site] || 0}&used=${regainUsageToday[site] || 0}&reason=limit`
            });
          });
          break; // Only block one tab
        }
      }
    }
  } catch (e) {
    console.error('checkExistingTabsOnStartup error:', e);
  }
}

// Initialize daily tracking
async function initDailyTracking() {
  const data = await chrome.storage.local.get([
    "regain_blocklist",
    "regain_dailyLimits", 
    "regain_usageToday",
    "regain_lastResetDate",
    "regain_deactivatedToday"
  ]);
  
  regainBlocklist = data.regain_blocklist || [];
  regainDailyLimits = data.regain_dailyLimits || {};
  regainUsageToday = data.regain_usageToday || {};
  regainLastResetDate = data.regain_lastResetDate || "";
  regainDeactivatedToday = data.regain_deactivatedToday || [];
  
  const today = new Date().toDateString();
  if (regainLastResetDate !== today) {
    resetDailyUsage();
  }
  
  // Mark as initialized BEFORE setting up listeners
  isTrackingInitialized = true;
  
  // Check if any open tabs are blocked sites and need immediate redirect
  checkExistingTabsOnStartup();
  
  // Listen for tab activation to track time
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url && tab.url.startsWith("http")) {
        const site = getSiteFromUrl(tab.url);
        if (site) {
          startTrackingTab(tabId, site);
        }
      }
    } catch (e) {}
  });
  
// Also track when tab URL changes or page loads
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url || (tab.url && tab.url.startsWith('http') ? tab.url : null);
    if (url && url.startsWith('http')) {
      const site = getSiteFromUrl(url);
      if (site) {
        startTrackingTab(tabId, site);
      }
    }
  });
   
 // Create midnight reset alarm
   const now = new Date();
   const midnight = new Date(now);
   midnight.setDate(midnight.getDate() + 1);
   midnight.setHours(0, 0, 0, 0);
   const msUntilMidnight = midnight.getTime() - now.getTime();
  
  chrome.alarms.create("regainMidnightReset", { delayInMinutes: msUntilMidnight / 60000 });
  
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "regainMidnightReset") {
      resetDailyUsage();
      // Reschedule for next midnight
      const m = new Date();
      m.setDate(m.getDate() + 1);
      m.setHours(0, 0, 0, 0);
      chrome.alarms.create("regainMidnightReset", { delayInMinutes: (m.getTime() - Date.now()) / 60000 });
    }
  });
  
  // Listen for messages to add time or deactivate
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "regainAddTime") {
      const { site, secs } = msg;
      // Increase limit, NOT decrease usage - usage is a running record
      regainDailyLimits[site] = (regainDailyLimits[site] || 0) + secs;
      chrome.storage.local.set({ regain_dailyLimits: regainDailyLimits });
      sendResponse({ success: true });
      // Resume tracking if this was the active tab
      if (sender.tab && sender.tab.id === regainActiveTabId) {
        setTimeout(() => startTrackingTab(sender.tab.id, site), 500);
      }
    }
    
    if (msg.type === "regainDeactivateSite") {
      const { site } = msg;
      if (!regainDeactivatedToday.includes(site)) {
        regainDeactivatedToday.push(site);
        chrome.storage.local.set({ regain_deactivatedToday: regainDeactivatedToday });
      }
      sendResponse({ success: true });
      // Clear tracking for this site (it's deactivated for today)
      if (regainActiveTabSite === site) {
        stopTrackingTab();
      }
    }
    
    if (msg.type === "regainActivateSite") {
      const { site } = msg;
      regainDeactivatedToday = regainDeactivatedToday.filter(s => s !== site);
      chrome.storage.local.set({ regain_deactivatedToday: regainDeactivatedToday });
      sendResponse({ success: true });
    }

    if (msg.type === "regainGetUsage") {
      sendResponse({ 
        usage: regainUsageToday,
        limits: regainDailyLimits,
        deactivated: regainDeactivatedToday
      });
    }
    
    return true;
  });
}

// Initialize on load
initDailyTracking();

async function updateRegainBlockingRules(blocklist, activate, focusDuration = 0, focusStartTime = 0) {
  if (!blocklist || !blocklist.length) return;
  
  const baseUrl = "blocked.html";
  const rules = blocklist.map((site, index) => {
    let redirectUrl = null;
    if (activate) {
      const params = new URLSearchParams();
      params.set('site', site);
      if (focusDuration > 0 && focusStartTime > 0) {
        params.set('reason', 'focus');
        params.set('duration', focusDuration);
        params.set('startTime', focusStartTime);
      }
      redirectUrl = baseUrl + '?' + params.toString();
    }
    
    return {
      id: index + 1,
      priority: 1,
      action: {
        type: activate ? "redirect" : "allow",
        redirect: redirectUrl ? { extensionPage: redirectUrl } : undefined
      },
      condition: {
        urlFilter: `https?://([wW]{3}\\.)?${site.replace(/\./g, "\\.")}(/.*)?`,
        resourceTypes: ["main_frame"]
      }
    };
  });
  
  if (activate) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: rules,
        removeRuleIds: rules.map(r => r.id)
      });
    } catch (e) {
      // Fallback: use webRequest for older browsers
      console.log("Regain blocking via webRequest");
    }
  } else {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: rules.map(r => r.id)
      });
    } catch (e) {}
  }
}

function activateRegainBlocking(blocklist, isFocusSession, focusDuration = 0, focusStartTime = 0) {
  regainBlockingActive = true;
  regainBlocklist = blocklist;
  regainFocusSession = isFocusSession;
  
  // Store current blocklist
  chrome.storage.local.set({ 
    regain_currentBlocklist: blocklist,
    regain_blockingActive: true,
    regain_focusDuration: focusDuration,
    regain_focusStartTime: focusStartTime
  });
  
  if (isFocusSession && focusDuration > 0 && focusStartTime > 0) {
    updateRegainBlockingRules(blocklist, true, focusDuration, focusStartTime);
  } else {
    updateRegainBlockingRules(blocklist, true);
  }
}

function deactivateRegainBlocking() {
  regainBlockingActive = false;
  regainFocusSession = false;
  
  chrome.storage.local.set({ 
    regain_blockingActive: false 
  });
  
  updateRegainBlockingRules(regainBlocklist, false);
}

function showRegainNotification(title, message) {
  if (chrome.notifications) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: title,
      message: message
    });
  }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "regainStartFocus") {
    activateRegainBlocking(
      msg.blocklist || [], 
      true, 
      msg.duration || 0, 
      msg.startTime || 0
    );
    sendResponse({ success: true });
  }
  
  if (msg.type === "regainStopFocus") {
    deactivateRegainBlocking();
    sendResponse({ success: true });
  }
  
  if (msg.type === "regainFocusComplete") {
    deactivateRegainBlocking();
    sendResponse({ success: true });
  }
  
  if (msg.type === "regainActivateBlocking") {
    activateRegainBlocking(
      msg.blocklist || [], 
      msg.isFocusSession || false,
      msg.focusDuration || 0,
      msg.focusStartTime || 0
    );
    sendResponse({ success: true });
  }
  
  if (msg.type === "regainDeactivateBlocking") {
    deactivateRegainBlocking();
    sendResponse({ success: true });
  }
  
  if (msg.type === "regainUpdateDailyLimit") {
    const { site, limit } = msg;
    console.log('[DEBUG] regainUpdateDailyLimit:', { site, limit, regainBlocklist, regainDailyLimits });
    regainDailyLimits[site] = limit;
    if (!regainBlocklist.includes(site)) {
      regainBlocklist.push(site);
    }
    chrome.storage.local.set({ 
      regain_dailyLimits: regainDailyLimits,
      regain_blocklist: regainBlocklist
    });
    sendResponse({ success: true });
    
    // Auto-start tracking if this site is currently active
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        const activeSite = getSiteFromUrl(tabs[0].url);
        if (activeSite === site && isBlockedSite(site)) {
          startTrackingTab(tabs[0].id, site);
        }
      }
    });
  }
  
  return true;
});
