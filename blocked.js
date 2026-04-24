const params = new URLSearchParams(window.location.search);
const site = params.get('site') || 'this site';
const reason = params.get('reason') || 'focus';
const limit = parseInt(params.get('limit')) || 0;
const used = parseInt(params.get('used')) || 0;
const duration = parseInt(params.get('duration')) || 0;
const startTime = parseInt(params.get('startTime')) || 0;

document.getElementById('blockedSite').textContent = site;

if (reason === 'limit') {
  document.getElementById('title').textContent = 'Limit Reached!';
  document.getElementById('limitBlock').classList.remove('hidden');
  
  // Format time display
  function formatTime(secs) {
    if (secs < 60) return secs + 's';
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
  }
  
  document.getElementById('usedTime').textContent = formatTime(used);
  document.getElementById('limitTime').textContent = formatTime(limit);
  
  function updateResetCountdown() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);
    const diff = midnight - now;
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    document.getElementById('resetTime').textContent = hours + 'h ' + mins + 'm';
  }
  updateResetCountdown();
  setInterval(updateResetCountdown, 60000);
  
} else {
  document.getElementById('focusBlock').classList.remove('hidden');
  
  if (duration > 0 && startTime > 0) {
    function updateTimer() {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, duration * 60 - elapsed);
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      document.getElementById('remainingTime').textContent = 
        mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
      
      if (remaining <= 0) {
        window.history.back();
      }
    }
    updateTimer();
    setInterval(updateTimer, 1000);
  }
}

document.querySelectorAll('.add-time-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const secs = parseInt(btn.dataset.secs);
    chrome.runtime.sendMessage({
      type: 'regainAddTime',
      site: site,
      secs: secs
    }, () => {
      window.history.back();
    });
  });
});

document.getElementById('deactivateBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({
    type: 'regainDeactivateSite',
    site: site
  }, () => {
    window.history.back();
  });
});