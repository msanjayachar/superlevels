// blocked-modal.js - Content script to show blocked overlay directly in DOM
// Runs on all pages, checks if current site is blocked and limit reached

(function() {
  'use strict';
  
  // Prevent multiple injections
  if (document.getElementById('regain-blocked-modal')) return;
  
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
  
  // Format time
  function formatTime(secs) {
    if (secs < 60) return secs + 's';
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    if (remainingSecs === 0) return mins + 'm';
    return mins + 'm ' + remainingSecs + 's';
  }
  
  // Get site and check if should show modal
  const currentSite = getSiteFromUrl(window.location.href);
  if (!currentSite) return;
  
  // Read from storage to get blocklist, limits, usage
  chrome.storage.local.get([
    'regain_blocklist',
    'regain_dailyLimits', 
    'regain_usageToday',
    'regain_deactivatedToday'
  ], function(data) {
    var blocklist = data.regain_blocklist || [];
    var dailyLimits = data.regain_dailyLimits || {};
    var usageToday = data.regain_usageToday || {};
    var deactivatedToday = data.regain_deactivatedToday || [];
    
    console.log('[Regain] Checking site:', currentSite, { blocklist: blocklist, dailyLimits: dailyLimits, usageToday: usageToday });
    
    // Check if site is blocked
    if (!isBlockedSite(currentSite, blocklist)) {
      console.log('[Regain] Site NOT in blocklist');
      return;
    }
    
    // Check if site is deactivated for today
    if (deactivatedToday.indexOf(currentSite) !== -1) {
      console.log('[Regain] Site is deactivated for today');
      return;
    }
    
    // Check if limit has been reached
    if (!checkLimitReached(currentSite, dailyLimits, usageToday)) {
      console.log('[Regain] Limit NOT reached');
      return;
    }
    
    // Site is blocked and limit reached - show the modal!
    var limit = dailyLimits[currentSite] || 0;
    var used = usageToday[currentSite] || 0;
    console.log('[Regain] Showing modal! Site:', currentSite, 'Used:', used, 'Limit:', limit);
    
    // Create the modal directly in DOM
    createModal(currentSite, used, limit);
  });
  
  function createModal(site, used, limit) {
    // Overlay
    var overlay = document.createElement('div');
    overlay.id = 'regain-blocked-modal';
    overlay.innerHTML = 
      '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:2147483646;">' +
      '<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:16px;padding:40px;max-width:540px;width:90%;text-align:center;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;min-height:520px;z-index:2147483647;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
      '<div style="font-size:72px;margin-bottom:16px;">⏱</div>' +
      '<div style="font-size:28px;font-weight:700;color:#fff;margin-bottom:12px;">Limit Reached!</div>' +
      '<div style="font-size:14px;color:#e94560;padding:8px 16px;background:rgba(233,69,96,0.1);border-radius:6px;display:inline-block;margin-bottom:24px;">' + site + '</div>' +
      '<div style="display:flex;justify-content:center;gap:60px;margin-bottom:24px;">' +
      '<div style="text-align:center;"><div style="font-size:36px;font-weight:700;color:#e94560;" id="regain-used">' + formatTime(used) + '</div><div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Used</div></div>' +
      '<div style="text-align:center;"><div style="font-size:36px;font-weight:700;color:#e94560;" id="regain-limit">' + formatTime(limit) + '</div><div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Limit</div></div>' +
      '</div>' +
      '<div style="color:#888;font-size:15px;margin-bottom:32px;">Add more time to continue</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:20px;">' +
      '<button data-secs="10" style="flex:1;min-width:80px;padding:14px 12px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;">+10s</button>' +
      '<button data-secs="300" style="flex:1;min-width:80px;padding:14px 12px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;">+5m</button>' +
      '<button data-secs="600" style="flex:1;min-width:80px;padding:14px 12px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;">+10m</button>' +
      '<button data-secs="900" style="flex:1;min-width:80px;padding:14px 12px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;">+15m</button>' +
      '<button data-secs="1200" style="flex:1;min-width:80px;padding:14px 12px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;">+20m</button>' +
      '</div>' +
      '<div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.05);">' +
      '<button id="regain-deactivate" style="width:100%;padding:14px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;background:transparent;border:1px solid #444;color:#888;margin-bottom:8px;">Deactivate Today</button>' +
      '<div style="font-size:12px;color:#555;margin-top:0;" id="regain-reset">Resets in <span id="regain-reset-time">--:--</span></div>' +
      '</div>' +
      '</div>' +
      '</div>';
    
    document.body.appendChild(overlay);
    
    // Add button event listeners
    var buttons = overlay.querySelectorAll('button[data-secs]');
    buttons.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var secs = parseInt(this.getAttribute('data-secs'));
        console.log('[Regain] Add time clicked:', secs);
        
        // Send message to background
        try {
          chrome.runtime.sendMessage({
            type: 'regainAddTime',
            site: site,
            secs: secs
          }, function() {
            console.log('[Regain] Time added, removing modal');
            overlay.remove();
          });
        } catch (err) {
          console.error('[Regain] Error:', err);
          overlay.remove();
        }
      });
    });
    
    // Deactivate button
    var deactivateBtn = document.getElementById('regain-deactivate');
    if (deactivateBtn) {
      deactivateBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Regain] Deactivate clicked');
        
        try {
          chrome.runtime.sendMessage({
            type: 'regainDeactivateSite',
            site: site
          }, function() {
            console.log('[Regain] Site deactivated, removing modal');
            overlay.remove();
          });
        } catch (err) {
          console.error('[Regain] Error:', err);
          overlay.remove();
        }
      });
    }
    
    // Update reset time
    function updateResetTime() {
      var now = new Date();
      var midnight = new Date(now);
      midnight.setDate(midnight.getDate() + 1);
      midnight.setHours(0, 0, 0, 0);
      var diff = midnight.getTime() - now.getTime();
      var hours = Math.floor(diff / 3600000);
      var mins = Math.floor((diff % 3600000) / 60000);
      var secs = Math.floor((diff % 60000) / 1000);
      var resetEl = document.getElementById('regain-reset-time');
      if (resetEl) {
        resetEl.textContent = hours.toString().padStart(2, '0') + ':' + mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
      }
    }
    
    updateResetTime();
    setInterval(updateResetTime, 1000);
    
    console.log('[Regain] Modal created successfully!');
  }
})();