// blocked-modal.js - Content script to show blocked overlay via iframe (zoom-independent)
// Runs on all pages, checks if current site is blocked and limit reached

(function() {
  'use strict';
  
  // Prevent multiple injections
  if (document.getElementById('regain-blocked-iframe')) return;
  
  // Get current site from hostname
  function getSiteFromUrl(url) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      return hostname;
    } catch {
      return null;
    }
  }
  
  // Check if site is in blocklist
  function isBlockedSite(site, blocklist) {
    if (!site || !blocklist || !blocklist.length) return false;
    const normalizedSite = site.replace(/^www\./, '');
    return blocklist.some(blocked => {
      const normalizedBlocked = blocked.replace(/^www\./, '');
      return normalizedSite === normalizedBlocked || 
             normalizedSite.endsWith('.' + normalizedBlocked) ||
             normalizedBlocked.endsWith('.' + normalizedSite);
    });
  }
  
  // Check if limit reached
  function checkLimitReached(site, dailyLimits, usageToday) {
    const limit = dailyLimits[site] || 0;
    const used = usageToday[site] || 0;
    return limit > 0 && used >= limit;
  }
  
  // Get site and check if should show modal
  const currentSite = getSiteFromUrl(window.location.href);
  if (!currentSite) return;
  
  // Get the modal URL - try chrome.runtime.getURL first, fallback to relative path
  function getModalURL() {
    // Try the standard way first
    try {
      if (chrome.runtime.getURL) {
        return chrome.runtime.getURL('blocked-modal.html');
      }
    } catch (e) {}
    // Fallback - this works in most browsers
    return 'blocked-modal.html';
  }
  
  // Read from storage to get blocklist, limits, usage
  chrome.storage.local.get([
    'regain_blocklist',
    'regain_dailyLimits', 
    'regain_usageToday',
    'regain_deactivatedToday'
  ], function(data) {
    const blocklist = data.regain_blocklist || [];
    const dailyLimits = data.regain_dailyLimits || {};
    const usageToday = data.regain_usageToday || {};
    const deactivatedToday = data.regain_deactivatedToday || [];
    
    console.log('[Regain] Checking site:', currentSite, { blocklist, dailyLimits, usageToday });
    
    // Check if site is blocked
    if (!isBlockedSite(currentSite, blocklist)) {
      console.log('[Regain] Site NOT in blocklist');
      return;
    }
    
    // Check if site is deactivated for today
    if (deactivatedToday.includes(currentSite)) {
      console.log('[Regain] Site is deactivated for today');
      return;
    }
    
    // Check if limit has been reached
    if (!checkLimitReached(currentSite, dailyLimits, usageToday)) {
      console.log('[Regain] Limit NOT reached, not showing modal');
      return;
    }
    
    // Site is blocked and limit reached - show the modal!
    const limit = dailyLimits[currentSite] || 0;
    const used = usageToday[currentSite] || 0;
    console.log('[Regain] Showing modal! Site:', currentSite, 'Used:', used, 'Limit:', limit);
    
    // Create semi-transparent overlay behind the modal
    const overlay = document.createElement('div');
    overlay.id = 'regain-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 2147483646;
    `;
    document.body.appendChild(overlay);
    
    // Create iframe to load extension page
    const iframe = document.createElement('iframe');
    iframe.id = 'regain-blocked-iframe';
    iframe.src = getModalURL();
    iframe.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      border: none;
      z-index: 2147483647;
      background: transparent;
    `;
    iframe.setAttribute('allowtransparency', 'true');
    document.body.appendChild(iframe);
    
    // Listen for messages from iframe
    window.addEventListener('message', function(event) {
      if (event.data && event.data.source === 'regain-blocked-modal') {
        const msgType = event.data.type;
        const site = event.data.site;
        const secs = event.data.secs;
        console.log('[Regain] Got message:', msgType, { site, secs });
        
        if (msgType === 'addTime') {
          try {
            chrome.runtime.sendMessage({
              type: 'regainAddTime',
              site: site,
              secs: secs
            }, function() {
              overlay.remove();
              iframe.remove();
            });
          } catch (e) {
            overlay.remove();
            iframe.remove();
          }
        }
        
        if (msgType === 'deactivate') {
          try {
            chrome.runtime.sendMessage({
              type: 'regainDeactivateSite',
              site: site
            }, function() {
              overlay.remove();
              iframe.remove();
            });
          } catch (e) {
            overlay.remove();
            iframe.remove();
          }
        }
      }
    });
    
    // Send init data to iframe once it loads
    iframe.addEventListener('load', function() {
      console.log('[Regain] Iframe loaded, sending init data');
      iframe.contentWindow.postMessage({
        type: 'init',
        site: currentSite,
        used: used,
        limit: limit
      }, '*');
    });
    
    // Handle iframe load error
    iframe.addEventListener('error', function(e) {
      console.error('[Regain] Iframe load error:', e);
    });
  });
})();