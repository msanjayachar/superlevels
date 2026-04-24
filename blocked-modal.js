// blocked-modal.js - Content script to show blocked overlay directly in DOM
// Runs on all pages, checks if current site is blocked and limit reached

(function () {
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
  ], function (data) {
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
    // Create host element for Shadow DOM
    var host = document.createElement('div');
    host.id = 'regain-blocked-modal';
    host.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;';

    // Create Shadow DOM
    var shadow = host.attachShadow({ mode: 'open' });

    // CSS for the modal (inline to work in Shadow DOM)
    var css = `
      :host {
        --spacing-xs: 4px;
        --spacing-sm: 8px;
        --spacing-md: 16px;
        --spacing-lg: 24px;
        --spacing-xl: 32px;
        --spacing-xxl: 60px;
        --spacing-btn: 10px;
        
        --font-size-xs: 11px;
        --font-size-sm: 12px;
        --font-size-md: 13px;
        --font-size-lg: 15px;
        --font-size-xl: 18px;
        --font-size-2xl: 28px;
        --font-size-3xl: 36px;
        
        --color-primary: #667eea;
        --color-primary-end: #764ba2;
        --color-accent: #e94560;
        --color-text: #e0e0e0;
        --color-text-muted: #888;
        --color-text-dim: #555;
        --color-bg: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        
        --radius-sm: 6px;
        --radius-md: 8px;
        --radius-lg: 12px;
        --radius-xl: 16px;
        
        --transition-fast: all 0.15s;
      }
      
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      .overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .modal {
        background: var(--color-bg);
        border-radius: var(--radius-xl);
        padding: 40px;
        max-width: 540px;
        width: 90%;
        min-height: 520px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        color: var(--color-text);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        display: flex;
        flex-direction: column;
      }
      
      .header {
        margin-bottom: var(--spacing-lg);
      }
      
      .icon {
        font-size: 72px;
        margin-bottom: var(--spacing-md);
      }
      
      .title {
        font-size: var(--font-size-2xl);
        font-weight: 700;
        color: #fff;
        margin-bottom: 12px;
      }
      
      .site {
        font-size: var(--font-size-sm);
        color: var(--color-accent);
        padding: 8px 16px;
        background: rgba(233, 69, 96, 0.1);
        border-radius: var(--radius-sm);
        display: inline-block;
      }
      
      .msg {
        color: var(--color-text-muted);
        font-size: var(--font-size-lg);
        margin-bottom: var(--spacing-xl);
      }
      
      .stats {
        display: flex;
        justify-content: center;
        gap: var(--spacing-xxl);
        margin-bottom: var(--spacing-lg);
      }
      
      .stat {
        text-align: center;
      }
      
      .stat-val {
        font-size: var(--font-size-3xl);
        font-weight: 700;
        color: var(--color-accent);
      }
      
      .stat-lbl {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-top: 4px;
      }
      
      .content {
        flex: 1;
      }
      
      .btns {
        display: flex;
        gap: var(--spacing-btn);
        margin-bottom: 20px;
      }
      
      .btn {
        flex: 1;
        min-width: 80px;
        padding: 14px 12px;
        border: none;
        border-radius: var(--radius-md);
        font-size: var(--font-size-lg);
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition-fast);
        position: relative;
        overflow: hidden;
      }
      
      .btn span {
        position: relative;
        z-index: 1;
      }
      
      .btn-primary {
        background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-end) 100%);
        color: #fff;
      }

      .btn-primary:disabled {
        background: #555;
        color: #888;
      }

      .btn-primary.btn-ready {
        background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-end) 100%);
        color: #fff;
      }

      .btn:disabled {
        cursor: not-allowed;
      }

      .btn:not(:disabled):not(.btn-ready):hover {
        transform: scale(1.02);
      }

      .btn .countdown-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: #888;
        width: 0%;
      }

      .btn:disabled .countdown-bar {
        width: 100%;
        background: rgba(100, 255, 100, 0.6);
      }

      .btn:not(:disabled) .countdown-bar {
        width: 100%;
        background: rgba(100, 255, 100, 0.6);
      }
      
      .footer {
        margin-top: var(--spacing-lg);
        padding-top: var(--spacing-md);
        border-top: 1px solid rgba(255,255,255,0.05);
      }
      
      .btn-deactivate {
        width: 100%;
        margin-bottom: var(--spacing-xs);
        padding: 14px 12px;
        background: transparent;
        border: 1px solid #444;
        color: var(--color-text-muted);
        border-radius: var(--radius-md);
        font-size: var(--font-size-lg);
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition-fast);
      }
      
      .btn-deactivate:hover {
        border-color: var(--color-accent);
        color: var(--color-accent);
      }
      
      .reset {
        font-size: var(--font-size-sm);
        color: var(--color-text-dim);
        margin-top: 0;
      }
    `;

    // Create modal HTML
    var modalHTML =
      '<style>' + css + '</style>' +
      '<div class="overlay">' +
      '<div class="modal">' +
      '<div class="content">' +
      '<div class="header">' +
      '<div class="icon">⏱</div>' +
      '<div class="title">Limit Reached!</div>' +
      '<div class="site">' + site + '</div>' +
      '</div>' +
      '<div class="stats">' +
      '<div class="stat"><div class="stat-val" id="regain-used">' + formatTime(used) + '</div><div class="stat-lbl">Used</div></div>' +
      '<div class="stat"><div class="stat-val" id="regain-limit">' + formatTime(limit) + '</div><div class="stat-lbl">Limit</div></div>' +
      '</div>' +
      '<div class="msg">Add more time to continue</div>' +
      '<div class="btns">' +
      '<button class="btn btn-primary" data-secs="120" data-loader="2"><span>+2m</span><div class="countdown-bar"></div></button>' +
      '<button class="btn btn-primary" data-secs="300" data-loader="5"><span>+5m</span><div class="countdown-bar"></div></button>' +
      '<button class="btn btn-primary" data-secs="600" data-loader="10"><span>+10m</span><div class="countdown-bar"></div></button>' +
      '<button class="btn btn-primary" data-secs="900" data-loader="15"><span>+15m</span><div class="countdown-bar"></div></button>' +
      '<button class="btn btn-primary" data-secs="1200" data-loader="20"><span>+20m</span><div class="countdown-bar"></div></button>' +
      '</div>' +
      '</div>' +
      '<div class="footer">' +
      '<button class="btn-deactivate" id="regain-deactivate">Deactivate Today</button>' +
      '<div class="reset">Resets in <span id="regain-reset-time">--:--</span></div>' +
      '</div>' +
      '</div>' +
      '</div>';

    shadow.innerHTML = modalHTML;
    document.body.appendChild(host);

    // Add button event listeners
    var buttons = shadow.querySelectorAll('button[data-secs]');
    buttons.forEach(function (btn) {
      var secs = parseInt(btn.getAttribute('data-secs'));
      var loaderSecs = parseInt(btn.getAttribute('data-loader'));
      var countdownBar = btn.querySelector('.countdown-bar');

      // Set initial disabled state
      btn.disabled = true;
      if (countdownBar) {
        var startTime = null;
        var duration = loaderSecs * 1000;

        function animateLoader(timestamp) {
          if (!startTime) startTime = timestamp;
          var progress = Math.min((timestamp - startTime) / duration, 1);
          var percent = progress * 100;

          countdownBar.style.width = percent + '%';

          if (progress < 1) {
            requestAnimationFrame(animateLoader);
          } else {
            btn.disabled = false;
            btn.classList.add('btn-ready');
          }
        }

        requestAnimationFrame(animateLoader);
      } else {
        btn.disabled = false;
        btn.classList.add('btn-ready');
      }

      btn.addEventListener('click', function (e) {
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
          }, function (response) {
            console.log('[Regain] Time added, checking if limit still reached');
            chrome.storage.local.get(['regain_dailyLimits', 'regain_usageToday'], function (data) {
              var limit = (data.regain_dailyLimits || {})[site] || 0;
              var used = (data.regain_usageToday || {})[site] || 0;
              if (limit > 0 && used >= limit) {
                console.log('[Regain] Limit still reached, keeping modal');
                return;
              }
              console.log('[Regain] Limit no longer reached, removing modal');
              host.remove();
            });
          });
        } catch (err) {
          console.error('[Regain] Error:', err);
          host.remove();
        }
      });
    });

    // Deactivate button
    var deactivateBtn = shadow.getElementById('regain-deactivate');
    if (deactivateBtn) {
      deactivateBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Regain] Deactivate clicked');

        try {
          chrome.runtime.sendMessage({
            type: 'regainDeactivateSite',
            site: site
          }, function () {
            console.log('[Regain] Site deactivated, removing modal');
            host.remove();
          });
        } catch (err) {
          console.error('[Regain] Error:', err);
          host.remove();
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
      var resetEl = shadow.getElementById('regain-reset-time');
      if (resetEl) {
        resetEl.textContent = hours.toString().padStart(2, '0') + ':' + mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
      }
    }

    updateResetTime();
    setInterval(updateResetTime, 1000);

    console.log('[Regain] Modal created successfully!');
  }
})();
