/**
 * ReviewSense Scout — Popup Script
 * Manages popup UI state, auth, and toggle communication.
 */

const BACKEND_URL = 'http://localhost:5000'

// ── DOM refs ────────────────────────────────────────────────
const hotelNameEl = document.getElementById('hotelName')
const statusDot = document.getElementById('statusDot')
const reviewCountEl = document.getElementById('reviewCount')
const issuesFoundEl = document.getElementById('issuesFound')
const criticalCountEl = document.getElementById('criticalCount')
const issuesList = document.getElementById('issuesList')
const toggleCheckbox = document.getElementById('toggleScraping')
const toggleStatus = document.getElementById('toggleStatus')
const openDashboardBtn = document.getElementById('openDashboard')
const authSection = document.getElementById('authSection')
const authLoggedIn = document.getElementById('authLoggedIn')
const loginForm = document.getElementById('loginForm')
const loginEmail = document.getElementById('loginEmail')
const loginPassword = document.getElementById('loginPassword')
const loginBtn = document.getElementById('loginBtn')
const authError = document.getElementById('authError')
const logoutBtn = document.getElementById('logoutBtn')

// ── Init on popup open ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Check auth state
  const { token } = await chrome.storage.local.get('token')
  updateAuthUI(!!token)

  // Request current stats from background
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
    if (chrome.runtime.lastError || !response) return
    updateStats(response)
  })
})

// ── Listen for live stat updates ────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATS_UPDATE') {
    updateStats(message.payload)
  }
})

// ── Update stats UI ─────────────────────────────────────────
function updateStats(data) {
  if (!data) return

  reviewCountEl.textContent = data.reviewCount || 0
  issuesFoundEl.textContent = data.issuesFound || 0
  criticalCountEl.textContent = data.criticalCount || 0

  if (data.currentHotel) {
    hotelNameEl.textContent = data.currentHotel
    statusDot.classList.add('active')
    statusDot.title = 'Connected — scraping active'
  }

  // Visual feedback when hotel changes
  if (data.hotelChanged) {
    hotelNameEl.style.transition = 'color 0.3s'
    hotelNameEl.style.color = '#f59e0b'
    setTimeout(() => {
      hotelNameEl.style.color = ''
    }, 2000)
    console.log(`[Popup] Hotel switched from "${data.previousHotel}" to "${data.currentHotel}"`)
  }

  // Toggle state
  if (typeof data.isActive === 'boolean') {
    toggleCheckbox.checked = data.isActive
    toggleStatus.textContent = data.isActive ? 'ON' : 'OFF'
    toggleStatus.classList.toggle('off', !data.isActive)
  }

  // Render emerging issues
  renderIssues(data.emergingIssues || [])
}

// ── Render emerging issues list ─────────────────────────────
function renderIssues(issues) {
  if (!issues.length) {
    issuesList.innerHTML = '<p class="empty-state">No issues detected yet</p>'
    return
  }

  // Sort by count descending, take top 5
  const sorted = issues.sort((a, b) => b.count - a.count).slice(0, 5)

  issuesList.innerHTML = sorted
    .map((issue) => {
      const severity = (issue.severity || 'Low').toLowerCase()
      return `
        <div class="issue-row">
          <span class="issue-topic">${escapeHtml(issue.topic)}</span>
          <span class="issue-count">×${issue.count}</span>
          <span class="severity-badge ${severity}">${issue.severity || 'Low'}</span>
        </div>
      `
    })
    .join('')
}

// ── Toggle scraping ─────────────────────────────────────────
toggleCheckbox.addEventListener('change', () => {
  const active = toggleCheckbox.checked
  toggleStatus.textContent = active ? 'ON' : 'OFF'
  toggleStatus.classList.toggle('off', !active)

  chrome.runtime.sendMessage({
    type: 'TOGGLE_SCRAPING',
    active,
  })
})

// ── Open dashboard ──────────────────────────────────────────
openDashboardBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:5173' })
})

// ── Auth: Login form ────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  authError.textContent = ''
  loginBtn.disabled = true
  loginBtn.textContent = 'Logging in...'

  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: loginEmail.value.trim(),
        password: loginPassword.value,
      }),
    })

    const data = await res.json()

    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Login failed')
    }

    // Store token
    await chrome.storage.local.set({ token: data.data.token })
    updateAuthUI(true)
  } catch (err) {
    authError.textContent = err.message
  } finally {
    loginBtn.disabled = false
    loginBtn.textContent = 'Login'
  }
})

// ── Auth: Logout ────────────────────────────────────────────
logoutBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove('token')
  updateAuthUI(false)
})

// ── Auth UI toggle ──────────────────────────────────────────
function updateAuthUI(isLoggedIn) {
  authSection.style.display = isLoggedIn ? 'none' : 'block'
  authLoggedIn.style.display = isLoggedIn ? 'flex' : 'none'
}

// ── Utility ─────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str || ''
  return div.innerHTML
}
