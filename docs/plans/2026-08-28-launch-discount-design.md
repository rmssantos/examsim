# Examplar 30% launch discount design

## Goal

Make the paid upgrade visible before a visitor opens the unlock modal, create a genuine limited launch offer, and send every purchase CTA to Gumroad with the discount already applied.

## Offer

- Code: `EXAMPLAR30`
- Discount: 30%
- Scope: all eight published Gumroad products
- Limit: 100 items across the discount
- Public wording: `Limited launch offer`
- Base prices stay unchanged at 17 EUR and 19 EUR
- Displayed offer prices are 11.90 EUR and 13.30 EUR

The quantity cap makes the scarcity real. The site will not claim that the offer ends today or show a fake countdown.

## Experience

The audience is a certification candidate who has already seen a free preview. The page has one commercial job: make the value and discounted price understandable before sending the candidate to checkout.

The signature element is a compact ticket strip inside each paid-preview card. It uses the existing Examplar amber flag family, so it feels native to the control-room UI rather than like a generic sale banner.

```text
┌────────────────────────────────────┐
│ AZ-104                             │
│ Microsoft Azure Administrator      │
│                                    │
│ [ Launch offer ]  30% off          │
│ €19.00  →  €13.30                  │
│ Code EXAMPLAR30 · Limited offer    │
│                                    │
│ [ Start ]         [ Unlock €13.30 ]│
└────────────────────────────────────┘
```

The modal repeats the offer directly above the purchase button. Results upsells, roadmap unlocks, and generated exam landing pages use the same copy and prices. Purchase links auto-apply the voucher, so the visible code is reassurance and recall rather than extra work.

## Visual system

- Graphite: `#1d232f` for the existing control-room shell
- Teal: `#0f766e` for primary actions
- Amber: `#b07d2b` for the offer label and discount emphasis
- Amber tint: `#fdf6e7` for the ticket background
- Ink: `#1f2733` for prices and body copy
- Surface: `#ffffff` for cards

Typography stays within the existing system: the site body face for readable copy, the existing bold display weights for the offer price, and Cascadia Mono/Consolas for the voucher code and numeric price alignment. No new font download or decorative animation is introduced.

## Data and safety

Each trusted bundled product receives a `pro.promotion` object containing the percentage, code, label, and limited flag. Prices are derived from the existing base price instead of duplicated. Gumroad remains the checkout source of truth.

Promotion fields are only rendered for trusted bundled products. JavaScript DOM construction uses `textContent`; HTML-producing paths keep their existing escaping. If promotion metadata is missing or malformed, the current full-price experience remains unchanged.

## Measurement

Existing events remain the funnel:

1. `pro_unlock_clicked`
2. `pro_modal_opened`
3. `pro_purchase_clicked`
4. Gumroad discount uses and sales

The first review happens after seven days or after the next 20 paid clicks, whichever comes later. The test succeeds commercially with at least one verified Gumroad sale; purchase-click lift is a supporting signal.

