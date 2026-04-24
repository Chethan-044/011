/**
 * ReviewSense Scout — Content Script (v2)
 * Injected into any Google Maps page.
 * Watches the DOM for review cards using multiple selector strategies,
 * handles SPA navigation, and sends each review to background.js.
 */
;(function () {
  'use strict'

  console.log('[ReviewSense Scout] Content script loaded on:', window.location.href)

  // ── State ─────────────────────────────────────────────────
  const sentReviewIds = new Set()
  let placeName = ''
  let scrolling = true
  let observerStarted = false
  let contextAlive = true // Tracks if the extension context is still valid

  // ── Safe message sender (handles extension reload gracefully) ──
  function safeSendMessage(msg) {
    if (!contextAlive) return
    try {
      chrome.runtime.sendMessage(msg)
    } catch (err) {
      if (err.message?.includes('Extension context invalidated')) {
        contextAlive = false
        scrolling = false
        console.warn(
          '[ReviewSense Scout] Extension was reloaded — please REFRESH this tab (F5) to reconnect.'
        )
      } else {
        console.error('[ReviewSense Scout] sendMessage error:', err.message)
      }
    }
  }

  // ── Multiple selector strategies for place name ───────────
  const PLACE_NAME_SELECTORS = [
    'h1.DUwDvf',
    'h1.fontHeadlineLarge',
    'h1[data-attrid]',
    'div[role="main"] h1',
    'div.tAiQdd h1',
    'h1.fontHeadlineSmall',
    '[data-header-feature-id] div.fontHeadlineLarge',
    'h1',
  ]

  // ── Multiple selector strategies for review containers ────
  const REVIEW_CONTAINER_SELECTORS = [
    '[data-review-id]',
    'div.jftiEf',
    'div.jJc9Ad',
    'div[data-reviewid]',
    'div.GHT2ce',
    'div.WMbnJf',
  ]

  // ── Multiple selector strategies for review text ──────────
  const REVIEW_TEXT_SELECTORS = [
    '.wiI7pd',
    '[class*="wiI7pd"]',
    'span.wiI7pd',
    '.MyEned span',
    '[data-expandable-section]',
    '.review-full-text',
  ]

  // ── Multiple selector strategies for "More" button ────────
  const MORE_BUTTON_SELECTORS = [
    'button.w8nwRe',
    'button[aria-label="See more"]',
    'button.M77dve',
    'a.review-more-link',
  ]

  // ── Selector for rating ───────────────────────────────────
  const RATING_SELECTORS = [
    'span.kvMYJc',
    'span[role="img"][aria-label*="star"]',
    'span[role="img"]',
  ]

  // ── Selector for reviewer name ────────────────────────────
  const REVIEWER_SELECTORS = [
    '.d4r55',
    '[class*="d4r55"]',
    'div.d4r55 span',
    'button[data-review-id] div',
    '.WNxzHc div',
  ]

  // ── Selector for timestamp ────────────────────────────────
  const TIMESTAMP_SELECTORS = [
    '.rsqaWe',
    '[class*="rsqaWe"]',
    'span.dehysf',
  ]

  // ── Selector for scrollable review panel ──────────────────
  const SCROLL_PANEL_SELECTORS = [
    'div.m6QErb.DxyBCb',
    'div.m6QErb[aria-label]',
    'div.m6QErb',
    'div[role="feed"]',
    'div.section-scrollbox',
  ]

  // ── Helper: try multiple selectors ────────────────────────
  function queryFirst(root, selectors) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel)
        if (el) return el
      } catch (_) { /* invalid selector */ }
    }
    return null
  }

  function queryAll(root, selectors) {
    const results = new Set()
    for (const sel of selectors) {
      try {
        root.querySelectorAll(sel).forEach((el) => results.add(el))
      } catch (_) { /* invalid selector */ }
    }
    return Array.from(results)
  }

  // ── Generate a stable reviewId from content ───────────────
  function generateReviewId(card) {
    // Prefer data-review-id attribute
    const dataId = card.getAttribute('data-review-id') || card.getAttribute('data-reviewid')
    if (dataId) return dataId

    // Generate from text content hash
    const text = (card.innerText || '').slice(0, 200).trim()
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return `rs-${Math.abs(hash).toString(36)}`
  }

  // ── Find the place/hotel name ─────────────────────────────
  function findPlaceName() {
    const el = queryFirst(document, PLACE_NAME_SELECTORS)
    const name = el?.innerText?.trim()
    if (name && name.length > 1 && name.length < 200) {
      return name
    }
    return ''
  }

  // ── Core scrape function ──────────────────────────────────
  function scrapeReview(card) {
    const reviewId = generateReviewId(card)
    if (!reviewId || sentReviewIds.has(reviewId)) return
    sentReviewIds.add(reviewId)

    // Click "More" to expand truncated review text
    const moreBtn = queryFirst(card, MORE_BUTTON_SELECTORS)
    if (moreBtn) {
      try { moreBtn.click() } catch (_) {}
    }

    // Wait for expansion then extract all fields
    setTimeout(() => {
      // Extract review text
      const textEl = queryFirst(card, REVIEW_TEXT_SELECTORS)
      const text = textEl?.innerText?.trim()

      if (!text || text.length < 5) {
        sentReviewIds.delete(reviewId) // Allow retry
        return
      }

      // Extract rating
      let rating = null
      const ratingEl = queryFirst(card, RATING_SELECTORS)
      if (ratingEl) {
        const ariaLabel = ratingEl.getAttribute('aria-label') || ''
        const match = ariaLabel.match(/(\d)/)
        if (match) rating = parseInt(match[1])
      }

      // Extract reviewer name
      const reviewerEl = queryFirst(card, REVIEWER_SELECTORS)
      const reviewer = reviewerEl?.innerText?.trim() || 'Anonymous'

      // Extract timestamp
      const timestampEl = queryFirst(card, TIMESTAMP_SELECTORS)
      const timestamp = timestampEl?.innerText?.trim() || ''

      // Detect language (if available)
      const langEl = card.querySelector('[data-language]')
      const language = langEl?.getAttribute('data-language') || 'en'

      // Update place name (it may load after initial check)
      if (!placeName) placeName = findPlaceName()

      const currentPlaceName = placeName || 'Unknown Hotel'

      // Send to background service worker
      safeSendMessage({
        type: 'NEW_REVIEW',
        payload: {
          reviewId,
          hotelName: currentPlaceName,
          text,
          rating,
          reviewer,
          timestamp,
          language,
          source: 'google_maps',
          url: window.location.href,
          scrapedAt: new Date().toISOString(),
        },
      })

      console.log(
        `[ReviewSense Scout] ✓ Scraped review from "${reviewer}": "${text.slice(0, 60)}..."`
      )
    }, 500)
  }

  // ── Scrape all visible review cards ───────────────────────
  function scrapeAllVisible() {
    const cards = queryAll(document, REVIEW_CONTAINER_SELECTORS)
    console.log(`[ReviewSense Scout] Found ${cards.length} review cards on page`)
    cards.forEach((card) => scrapeReview(card))
  }

  // ── MutationObserver for new review cards ─────────────────
  function startObserver() {
    if (observerStarted) return
    observerStarted = true

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue

          // Check if this node IS a review card
          for (const sel of REVIEW_CONTAINER_SELECTORS) {
            try {
              if (node.matches && node.matches(sel)) {
                scrapeReview(node)
                break
              }
            } catch (_) {}
          }

          // Check for review cards INSIDE the added node
          if (node.querySelectorAll) {
            const inner = queryAll(node, REVIEW_CONTAINER_SELECTORS)
            inner.forEach((card) => scrapeReview(card))
          }
        }
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    console.log('[ReviewSense Scout] MutationObserver started')
  }

  // ── Click the "Reviews" tab in Google Maps ──────────────────
  // Google Maps place panel has tabs: Overview | Menu | Reviews | About
  // We click "Reviews" to go directly to the full scrollable reviews list.
  function openAllReviews() {
    // Check if already on the reviews tab (many cards visible)
    const existingCards = queryAll(document, REVIEW_CONTAINER_SELECTORS)
    if (existingCards.length > 10) {
      console.log(`[ReviewSense Scout] Already on Reviews tab (${existingCards.length} cards)`)
      return
    }

    // Strategy 1: role="tab" buttons in the tab bar
    const allTabs = document.querySelectorAll('button[role="tab"]')
    for (const tab of allTabs) {
      const text = (tab.innerText || '').trim().toLowerCase()
      if (text.includes('review')) {
        console.log('[ReviewSense Scout] ✓ Clicking "Reviews" tab')
        tab.click()
        return
      }
    }

    // Strategy 2: Tab bar buttons without role="tab"
    const tabBarBtns = document.querySelectorAll('div[role="tablist"] button, div.RWPxGd button')
    for (const btn of tabBarBtns) {
      const text = (btn.innerText || '').trim().toLowerCase()
      if (text.includes('review')) {
        console.log('[ReviewSense Scout] ✓ Clicking Reviews tab (tablist)')
        btn.click()
        return
      }
    }

    // Strategy 3: Any button/link matching "Reviews" or "N reviews"
    const allButtons = document.querySelectorAll('button, a[role="button"]')
    for (const btn of allButtons) {
      const text = (btn.innerText || btn.getAttribute('aria-label') || '').trim()
      if (/^reviews$/i.test(text) || /^\d[\d,]*\s+reviews?$/i.test(text)) {
        console.log(`[ReviewSense Scout] ✓ Clicking: "${text}"`)
        btn.click()
        return
      }
    }

    console.log('[ReviewSense Scout] Reviews tab not found — scraping visible reviews')
  }

  // ── Auto-scroll the review panel ──────────────────────────
  let lastScrollReviewCount = 0
  let scrollStallCount = 0
  const MAX_STALL_COUNT = 15 // Google Maps loads in batches; wait longer between them

  // Selectors for Google Maps' loading spinner (appears between review batches)
  const LOADING_SELECTORS = [
    'div.qjESne',           // Loading spinner container
    'div[role="progressbar"]',
    'div.section-loading',
    'img[src*="loading"]',
    'div.m6QErb div.qjESne',
  ]

  function isLoadingMore() {
    for (const sel of LOADING_SELECTORS) {
      try {
        const el = document.querySelector(sel)
        if (el && el.offsetHeight > 0) return true
      } catch (_) {}
    }
    return false
  }

  function autoScroll() {
    if (!scrolling || !contextAlive) return

    const panel = queryFirst(document, SCROLL_PANEL_SELECTORS)
    if (panel) {
      // Scroll to the very bottom to trigger lazy-loading
      panel.scrollTop = panel.scrollHeight

      // If Google Maps is loading a new batch, wait patiently
      if (isLoadingMore()) {
        scrollStallCount = 0 // Reset — new reviews are coming
        setTimeout(autoScroll, 2000)
        return
      }

      // Check if new reviews appeared since last scroll
      const currentCount = sentReviewIds.size
      if (currentCount === lastScrollReviewCount) {
        scrollStallCount++
        if (scrollStallCount >= MAX_STALL_COUNT) {
          console.log(
            `[ReviewSense Scout] Reached end — ${currentCount} reviews scraped (no new reviews after ${MAX_STALL_COUNT} attempts)`
          )
          // Keep trying slowly in case more load later
          setTimeout(autoScroll, 8000)
          return
        }
      } else {
        scrollStallCount = 0
        lastScrollReviewCount = currentCount
      }
    }

    setTimeout(autoScroll, 1500)
  }

  // ── Periodic re-scrape to catch lazy-loaded reviews ───────
  function startPeriodicScrape() {
    setInterval(() => {
      if (!scrolling || !contextAlive) return
      scrapeAllVisible()
    }, 3000)
  }

  // ── Initialize: wait for place name to appear ─────────────
  function init() {
    placeName = findPlaceName()

    if (placeName) {
      console.log(`[ReviewSense Scout] ✓ Place detected: "${placeName}"`)

      // Notify background about current hotel
      safeSendMessage({
        type: 'NEW_REVIEW',
        payload: null, // No review, just to trigger hotel name detection
      })

      startObserver()
      scrapeAllVisible()
      autoScroll()
    } else {
      console.log('[ReviewSense Scout] No place name yet — waiting...')
    }
  }

  // ── Poll for place name (handles SPA navigation) ──────────
  let initAttempts = 0
  const MAX_ATTEMPTS = 60 // Try for up to 2 minutes

  function pollForPlace() {
    initAttempts++
    placeName = findPlaceName()

    if (placeName) {
      console.log(`[ReviewSense Scout] ✓ Place found after ${initAttempts} attempts: "${placeName}"`)
      startObserver()

      // Try to open the full reviews panel first
      setTimeout(() => {
        openAllReviews()

        // After clicking, wait for the reviews panel to load
        setTimeout(() => {
          scrapeAllVisible()
          autoScroll()
          startPeriodicScrape()
        }, 2000)
      }, 1000)
      return
    }

    if (initAttempts < MAX_ATTEMPTS) {
      setTimeout(pollForPlace, 2000)
    } else {
      console.log('[ReviewSense Scout] Could not find place name after max attempts')
      // Start observer anyway to catch future navigation
      startObserver()
    }
  }

  // ── Detect Google Maps SPA navigation ─────────────────────
  let lastUrl = window.location.href
  setInterval(() => {
    if (!contextAlive) return
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      console.log('[ReviewSense Scout] URL changed:', lastUrl)

      // Reset ALL state for new page/hotel
      placeName = ''
      observerStarted = false
      initAttempts = 0
      sentReviewIds.clear() // Clear so new hotel reviews aren't blocked by old IDs
      lastScrollReviewCount = 0
      scrollStallCount = 0

      // Wait for the new place name, then notify background of the change
      setTimeout(() => {
        const newPlace = findPlaceName()
        if (newPlace) {
          placeName = newPlace
          console.log(`[ReviewSense Scout] New place detected after navigation: "${newPlace}"`)

          // Notify background about the hotel change BEFORE reviews arrive
          safeSendMessage({
            type: 'NEW_REVIEW',
            payload: { hotelName: newPlace, text: null },
          })
        }

        pollForPlace()
      }, 1500)
    }
  }, 1000)

  // ── Listen for popup toggle ───────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_SCRAPING') {
      scrolling = msg.active
      console.log(`[ReviewSense Scout] Scraping ${scrolling ? 'resumed' : 'paused'}`)
      if (scrolling) autoScroll()
    }
  })

  // ── Start ─────────────────────────────────────────────────
  pollForPlace()
})()
