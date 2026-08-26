# Ownership & Transfer — design

Status: DESIGN (2026-08-26, owner-requested). Implements the NORTHSTAR promise
"history that survives owners". Read before touching events/vehicles.

## Core idea
The **vehicle record is the durable thing; people attach to it through
ownership periods.** Everything else (attribution, filters, chart segments,
locking, transfer) derives from periods.

```
vehicle_ownerships
  id, vehicle_id, ordinal (1 = first known owner)
  owner_user_id   nullable  -- null = not a CarFable user ("previous owner")
  label           nullable  -- free text shown when owner_user_id is null, e.g. "Previous owner", "First owner (dealer fleet)"
  start_date      date      -- required
  start_mileage   int       nullable
  end_date        date      nullable  -- null = current
  end_mileage     int       nullable
  show_owner_name bool      default true  -- for user-owned periods: link username or show "Previous owner"
  created_by      user id
```

- `vehicles.owner_id` stays (= the current period's owner, denormalized).
- `vehicles.purchase_date` / `mileage` are migrated INTO the current period
  (start_date / start_mileage) and kept in sync (they remain the UI fields).
- **Attribution is by date, not by input.** An event belongs to the period
  whose [start, end) contains `event_date`. Events dated before the first
  known period fall into an implicit "Before known owners" bucket, rendered as
  "Previous owner".
  → For the owner's case (stack of the previous owner's bills): just enter
  them with their real dates. Nothing new to fill in. `purchase_date` is the
  boundary. Zero extra UI for "old bills".

## What the owner sees (Slice 1)
- **Timeline divider** at each period boundary: "▸ @joseprupi took over ·
  Mar 2019 · 145,200 mi". Events before it get a muted "previous owner" badge.
- **Ownership filter** (History tab, next to type filter): chips
  `All` · `Your ownership` · `Previous owners` (one chip per period when >2).
  URL-shareable (`?owner=all|mine|<periodId>`).
- **Mileage chart**: vertical boundary line(s); segments colored per period;
  origin stays the earliest known mileage.
- **Stats**: toggle `Your ownership` (default) / `Lifetime`. Cost/mile,
  MPG, spend by category all respect it. Lifetime shows total invested in the
  car across owners — a selling argument.
- **Period label editing**: current owner can rename previous non-user periods
  ("Previous owner" → whatever) and set their start/end dates+mileage. Advice
  text: "Avoid real names of people who aren't on CarFable."
- Export: CSV gains an `owner` column (label or @username); ZIP includes
  `ownerships.json`.

## Transfer of ownership (Slice 2)
Transfer = close the current period, open a new one for another user. The
vehicle (VIN, cover photo, mods, events, media, documents) **stays as one
record**. Nothing is copied.

### Flow
1. Giver: vehicle → ⋯ → **Transfer ownership**. Sets handover date + mileage
   (defaults: today / last odometer). Chooses options (below). Gets a one-time
   **transfer link/code** (7-day expiry, revocable). Sends it to the buyer
   however they like (text, email, in the listing).
2. Receiver: opens link → must be logged in → sees a preview (car, history
   count, what's included) → **Accept**. Atomically: old period gets
   end_date/end_mileage; new period created with owner_user_id=receiver;
   `vehicles.owner_id` switches; nickname cleared (personal); visibility kept.
3. No undo after acceptance (do a transfer back if needed). Link revocable
   before.

### Giver options (defaults chosen for the moat = max continuity)
| Option | Default | Why |
|---|---|---|
| Show my name on the previous-owner period | **yes** | trust; can opt out → shows "Previous owner" |
| Keep receipts/documents attached | **yes** | receipts may carry giver's address/phone; opt out strips `vehicle_event_document` files and receipt photos from that period's events (events + amounts stay) |
| Keep my posts tagged to this vehicle | **yes** | posts remain the giver's content; tag keeps them in the vehicle's Posts tab with author attribution; opt out untags |

### What moves / what stays
- **Moves with the car**: history events (+ media/docs unless stripped), mods,
  cover photo, VIN, ownership periods, event tags/fuel data.
- **Stays with the person**: posts (authorship is immutable), comments, likes,
  profile. Posts keep their vehicle tag (unless untagged) → vehicle Posts tab
  shows them with "by @giver · previous owner".
- **Giver afterwards**: vehicle leaves "My Garage" → appears in a new
  **"Previously owned"** section (read-only public view + their own posts).

### Locking (what makes the record trustworthy)
Rule: **an event is editable/deletable iff the viewer is the current owner AND
created it.** Consequences:
- Bills the owner enters for a previous period → theirs, editable.
- After transfer, the giver's events are read-only for everyone (giver no
  longer owns; receiver didn't create). Receiver may **hide** an event from
  the public page (kept, marked hidden, shown to owner, exported with flag) —
  never delete. Backlog: "dispute" note.
- Mods: editable by current owner regardless (they're physical, current state).

### Auto events
None. The divider is derived from periods; no synthetic "sold"/"bought"
events. (`purchase`/`sale` event types remain available for people who want
to log price/details manually.)

## Backlog (Slice 3+)
- **Claim a previous period**: current owner links a non-user period to a real
  username with that user's consent (notification) → their name/avatar shows.
- Multiple explicit historical periods with dates ("3 owners before me").
- VIN match on add-vehicle: "this car already exists on CarFable (owned by
  @x) — request transfer?" (ties into VIN search backlog in FEATURES.md).
- Dispute notes on locked events; transfer with money/escrow — never.

## Delivery
- **Slice 1 (M)**: migration (`vehicle_ownerships` + backfill one current period
  per vehicle from purchase_date/mileage; implicit previous bucket), API:
  periods CRUD for current owner (label/dates only for non-user periods),
  `ownership` derived field on events read; web+mobile: divider, badge, filter
  chips, chart boundaries, stats toggle, label editing, export column.
  Backend tests: attribution by date, lock rule (with the user==creator path).
- **Slice 2 (L)**: transfers table + link/code, accept endpoint (transactional),
  options (strip docs / untag posts / anonymize), garage "Previously owned",
  locking + hide, notifications-lite (email via hello@ later).
- Slice 3: backlog above.

## Open decisions (owner to confirm)
1. Stats default: `Your ownership` vs `Lifetime`. Design says Your ownership
   (buyers flip to Lifetime).
2. Receiver can **hide** but never delete prior-owner events — OK?
3. Giver's posts stay tagged by default — OK?
