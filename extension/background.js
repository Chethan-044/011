/**
 * ReviewSense Scout — Background Service Worker
 * Receives scraped reviews from content.js.
 * POSTs directly to existing Node.js backend endpoint.
 * Updates extension badge with live count.
 * Sends Chrome notification on critical issue detection.
 */

const BACKEND_URL = 'http://localhost:5000'

let reviewCount = 0
let criticalCount = 0
let issuesFound = 0
let isActive = true
let latestResult = null
let currentHotel = ''
const emergingIssues = new Map() // topic → { count, severity }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NEW_REVIEW' && isActive) {
    // Detect hotel/business change and reset all session stats
    if (message.payload?.hotelName && message.payload.hotelName !== currentHotel) {
      const previousHotel = currentHotel
      currentHotel = message.payload.hotelName

      // Only reset if we're switching FROM one hotel to another (not initial load)
      if (previousHotel) {
        console.log(
          `[ReviewSense Scout] Hotel changed: "${previousHotel}" → "${currentHotel}" — resetting session`
        )
        reviewCount = 0
        criticalCount = 0
        issuesFound = 0
        latestResult = null
        emergingIssues.clear()

        // Update badge to reflect reset
        chrome.action.setBadgeText({ text: '' })
        chrome.action.setBadgeBackgroundColor({ color: '#1D9E75' })

        // Notify popup of the reset
        chrome.runtime.sendMessage({
          type: 'STATS_UPDATE',
          payload: {
            reviewCount: 0,
            criticalCount: 0,
            issuesFound: 0,
            currentHotel,
            emergingIssues: [],
            latest: null,
            hotelChanged: true,
            previousHotel,
          },
        }).catch(() => { /* popup not open */ })
      }
    }

    // Only forward actual reviews (not null payloads from hotel name detection)
    if (message.payload && message.payload.text) {
      forwardToBackend(message.payload)
    }
  }

  if (message.type === 'GET_STATS') {
    sendResponse({
      reviewCount,
      criticalCount,
      issuesFound,
      isActive,
      currentHotel,
      emergingIssues: Array.from(emergingIssues.entries()).map(([topic, data]) => ({
        topic,
        ...data,
      })),
      latest: latestResult,
    })
    return true // keep channel open for async
  }

  if (message.type === 'TOGGLE_SCRAPING') {
    isActive = message.active
    // Forward toggle to content script in active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message)
      }
    })
  }

  return false
})

async function forwardToBackend(payload) {
  const { token } = await chrome.storage.local.get('token')

  if (!token) {
    console.warn('[ReviewSense Scout] No auth token — please login via popup')
    return
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/extension/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[ReviewSense Scout] Backend error:', res.status, errText)
      return
    }

    const result = await res.json()
    latestResult = result

    reviewCount++

    // Track emerging issues
    if (result.sentiment?.sentiment === 'NEGATIVE' || result.isCritical) {
      issuesFound++
    }

    // Update badge — green normally, red on critical
    chrome.action.setBadgeText({ text: String(reviewCount) })
    chrome.action.setBadgeBackgroundColor({
      color: result.isCritical ? '#ef4444' : '#1D9E75',
    })

    if (result.isCritical) {
      criticalCount++

      // Track emerging issue topic
      const topic = result.topic || 'Unknown Issue'
      const existing = emergingIssues.get(topic) || { count: 0, severity: 'Low' }
      existing.count++
      existing.severity = criticalCount >= 5 ? 'Critical' : criticalCount >= 3 ? 'High' : 'Medium'
      emergingIssues.set(topic, existing)

      // Chrome notification
      chrome.notifications.create(`critical-${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'ReviewSense — Critical Issue',
        message: `${result.topic} detected at ${payload.hotelName}`,
      })
    }

    // Broadcast stats update to popup (if open)
    chrome.runtime.sendMessage({
      type: 'STATS_UPDATE',
      payload: {
        reviewCount,
        criticalCount,
        issuesFound,
        currentHotel,
        emergingIssues: Array.from(emergingIssues.entries()).map(([t, d]) => ({
          topic: t,
          ...d,
        })),
        latest: result,
      },
    }).catch(() => {
      // popup not open — ignore
    })

    console.log(
      `[ReviewSense Scout] ✓ Review ${payload.reviewId} processed (total: ${reviewCount})`
    )
  } catch (err) {
    console.error('[ReviewSense Scout] Network error:', err.message)
  }
}
