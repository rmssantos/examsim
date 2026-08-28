# Examplar 30% Launch Discount Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a genuine 30% limited launch offer to every paid Examplar purchase surface and connect it to one Gumroad discount capped at 100 items.

**Architecture:** Store promotion facts beside each trusted product's existing `pro` metadata, derive offer prices from the base price, and render a shared visual vocabulary across homepage cards, modals, results upsells, roadmaps, and generated landing pages. Keep the current full-price flow as the fallback when promotion data is absent or invalid.

**Tech Stack:** Vanilla JavaScript DOM rendering, Python static-page generator, CSS custom properties, JSON metadata, Python unittest, Playwright browser smoke tests, Gumroad checkout UI.

---

### Task 1: Define promotion metadata contract

**Files:**
- Modify: `tests/test_pro_pack.py`
- Modify: `user-content/exams/{ab620,ai103,az104,az305,az400,dp700,saac03,sc300}/metadata.json`

**Step 1: Write the failing test**

Add a test that loads every bundled `pro-preview` metadata file and asserts:

```python
promotion == {
    "label": "Launch offer",
    "discountPercent": 30,
    "code": "EXAMPLAR30",
    "limited": True,
}
```

Also assert every purchase URL is HTTPS and contains the Gumroad-generated discount token.

**Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_pro_pack.ProPackTests.test_all_pro_packs_share_launch_promotion -v`

Expected: FAIL because `promotion` is missing.

**Step 3: Write minimal metadata**

Add the promotion object to each of the eight `pro` objects and replace each product URL with its Gumroad auto-applied discount URL.

**Step 4: Run test to verify it passes**

Run the same unittest and expect PASS.

### Task 2: Render promotion on homepage cards and modal

**Files:**
- Modify: `tests/test_pro_pack.py`
- Modify: `assets/js/homepage.js`
- Modify: `assets/css/home-v2.css`

**Step 1: Write failing rendering assertions**

Assert the homepage source contains the promotion normalizer and the classes `exam-card-offer`, `offer-price-old`, `offer-price-new`, `offer-code`, and `pro-modal-offer`.

**Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_pro_pack.ProPackTests.test_homepage_renders_launch_offer -v`

Expected: FAIL because the offer UI does not exist.

**Step 3: Implement the minimum UI**

Add a helper that validates `discountPercent`, parses `pro.price`, derives the discounted EUR price, and returns null on malformed input. Build the card and modal with DOM nodes and `textContent`. Change the unlock label to include the discounted price only when a valid promotion exists.

Add responsive, dark-mode-safe ticket-strip styles using the existing amber tokens. Preserve keyboard focus and reduced-motion behavior.

**Step 4: Run focused tests**

Run: `python -m unittest tests.test_pro_pack -v`

Expected: PASS.

### Task 3: Keep every purchase surface consistent

**Files:**
- Modify: `tests/test_conversion_funnel.py`
- Modify: `tests/test_exam_seo_pages.py`
- Modify: `assets/js/roadmaps.js`
- Modify: `assets/js/script-multi-exam.js`
- Modify: `tools/generate-exam-pages.py`
- Modify: `assets/css/exam-v2.css`
- Modify: `assets/css/exam-landing.css`
- Regenerate: `exams/*/index.html`
- Regenerate: `exams/index.html`
- Regenerate: `sitemap.xml`

**Step 1: Write failing tests**

Assert generated preview pages show `30% off`, the original price, the derived offer price, `EXAMPLAR30`, and `Limited launch offer`. Assert roadmap and results code include promotion-aware classes and preserve escaped URLs/copy.

**Step 2: Run tests to verify they fail**

Run: `python -m unittest tests.test_exam_seo_pages.PricingTests tests.test_conversion_funnel -v`

Expected: FAIL because those surfaces only render the base price.

**Step 3: Implement and regenerate**

Add equivalent guarded price derivation to the Python generator and promotion-aware markup to the two JavaScript upsells. Extend the existing styles without changing the control-room layout. Run `python tools/generate-exam-pages.py`.

**Step 4: Run focused tests**

Run the same test modules and expect PASS.

### Task 4: Create the Gumroad discount

**External state:** Gumroad → Checkout → Discounts

**Step 1: Create one discount**

- Name: `Examplar launch offer`
- Code: `EXAMPLAR30`
- Products: All products
- Type: Percentage, 30%
- Limit quantity: 100
- No public countdown or fake expiry

**Step 2: Capture product links**

Copy each unique product link that automatically applies the discount and use those exact URLs in Task 1 metadata.

**Step 3: Verify**

Open AZ-104 and one 17 EUR product through the site links. Confirm Gumroad shows the 30% discount and the expected 13.30 EUR / 11.90 EUR product subtotal before purchase.

### Task 5: Full verification

**Files:** all files above

**Step 1: Run the full Python suite**

Run: `python -m unittest discover -s tests -p "test_*.py"`

Expected: 0 failures.

**Step 2: Run browser smoke tests**

Run: `npm run test:browser`

Expected: exit 0.

**Step 3: Visual review**

Serve the worktree locally, inspect desktop and mobile cards/modal in light and dark themes, and confirm focus styles and checkout links.

**Step 4: Review the diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors and only intended promotion files changed.

