const params = new URLSearchParams(window.location.search);
const site = params.get('site') || 'this site';
const reason = params.get('reason') || 'focus';
const limit = parseInt(params.get('limit')) || 0;
const used = parseInt(params.get('used')) || 0;
const duration = parseInt(params.get('duration')) || 0;
const startTime = parseInt(params.get('startTime')) || 0;

document.getElementById('blockedSite').textContent = site;

// Format time display
function formatTime(secs) {
  if (secs < 60) return secs + 's';
  const mins = Math.floor(secs / 60);
  const remainingSecs = secs % 60;
  return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
}

// Format time short
function formatTimeShort(secs) {
  if (secs < 60) return secs + 's';
  const mins = Math.floor(secs / 60);
  const remainingSecs = secs % 60;
  if (remainingSecs === 0) return mins + 'm';
  return `${mins}m ${remainingSecs}s`;
}

if (reason === 'limit') {
  document.getElementById('title').textContent = 'Limit Reached!';
  document.getElementById('limitBlock').classList.remove('hidden');
  
  document.getElementById('usedTime').textContent = formatTime(used);
  document.getElementById('limitTime').textContent = formatTime(limit);
  
  // Update modal with current usage
  document.getElementById('modalUsedTime').textContent = used;
  
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
  
  // Start countdown for all buttons
  startButtonCountdowns();
  
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

// Button countdown functionality
function startButtonCountdowns() {
  const buttons = document.querySelectorAll('.add-time-btn');
  
  buttons.forEach(btn => {
    const cooldown = parseInt(btn.dataset.cooldown) || 3;
    const secs = parseInt(btn.dataset.secs);
    const countdownBar = btn.querySelector('.countdown-bar');
    
    // Disable button initially
    btn.disabled = true;
    
    let elapsed = 0;
    const interval = 100; // Update every 100ms for smooth animation
    const totalDuration = cooldown * 1000;
    
    const countdownInterval = setInterval(() => {
      elapsed += interval;
      const progress = (elapsed / totalDuration) * 100;
      countdownBar.style.width = progress + '%';
      
      if (elapsed >= totalDuration) {
        clearInterval(countdownInterval);
        btn.disabled = false;
        countdownBar.style.width = '100%';
        countdownBar.style.background = 'rgba(100, 255, 100, 0.5)';
      }
    }, interval);
  });
}

// Modal functionality
let pendingAddTime = null;

document.querySelectorAll('.add-time-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (btn.disabled) return;
    
    e.preventDefault();
    
    const secs = parseInt(btn.dataset.secs);
    
    // Show confirmation modal
    pendingAddTime = secs;
    
document.getElementById('modalUsedTime').textContent = formatTimeShort(used);
    document.getElementById('modalAskTime').innerHTML = 
      `You've used <strong>${formatTimeShort(used)}</strong>. Are you sure you want to use <strong>+${formatTimeShort(secs)}</strong> more?`;
    
    document.getElementById('confirmModal').classList.remove('hidden');
  });
});

document.getElementById('modalCancel').addEventListener('click', () => {
  pendingAddTime = null;
  document.getElementById('confirmModal').classList.add('hidden');
});

document.getElementById('modalConfirm').addEventListener('click', () => {
  if (pendingAddTime !== null) {
    const secs = pendingAddTime;
    pendingAddTime = null;
    document.getElementById('confirmModal').classList.add('hidden');
    
    // Send message to background to add time
    chrome.runtime.sendMessage({
      type: 'regainAddTime',
      site: site,
      secs: secs
    }, () => {
      // Go back to the site
      window.history.back();
    });
  }
});

// Close modal on overlay click
document.getElementById('confirmModal').addEventListener('click', (e) => {
  if (e.target.id === 'confirmModal') {
    pendingAddTime = null;
    document.getElementById('confirmModal').classList.add('hidden');
  }
});

document.getElementById('deactivateBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({
    type: 'regainDeactivateSite',
    site: site
  }, () => {
    window.history.back();
  });
});