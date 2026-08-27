# Verigence UI Governance Contract

**Version:** 1.0  
**Effective date:** 25 Aug 2026  
**Applies to:** Verigence Web and Android/Capacitor UI

This contract is mandatory for all new and changed screens. A successful TypeScript build is not sufficient evidence of UI compliance.

## 1. Application background

1. Every screen must use the same navy-to-teal application background as the approved Sign in screen.
2. The governed background is defined only in `src/styles/ui-governance.css` as `--verigence-app-background`.
3. Sky-blue / pale-blue colors must not be used as application/page backgrounds.
4. White or off-white content surfaces/cards are placed over the governed application background.
5. Page-specific styles must not override the governed application-shell background after `ui-governance.css`.

Approved background:

```css
radial-gradient(
  ellipse at 78% 48%,
  rgba(0, 175, 168, 0.28) 0%,
  rgba(0, 175, 168, 0.16) 32%,
  transparent 72%
),
linear-gradient(158deg, #011e47 0%, #013060 55%, #026d7d 100%);
```

## 2. Operational context visibility

### Project Name

The actual Project Name is internal application context and must not be displayed in the operational UI.

Prohibited locations include:

- Project/workspace selection;
- global sidebar;
- global top bar / breadcrumb;
- Booking;
- Delivery;
- Audit Review;
- operational cards, headings and footers.

Where a user must choose among assignments, use neutral labels such as `Workspace 1`, `Workspace 2`, operating role and other non-name metadata.

### Dealer and Outlet Name

Dealer Name and Outlet Name are allowed only on the operational Landing Page because they establish the PC's current business context.

They are prohibited after the PC enters Booking, Delivery, Audit Review, or another operational task screen.

The pre-landing outlet chooser uses neutral `Work Location` labels and must not expose Dealer or Outlet names.

### Administration exception

Administrative master/configuration screens whose explicit purpose is to create or maintain Project, Dealer or Outlet records may display those master values as data being administered. This exception does not apply to operational navigation or journey screens.

## 3. Adaptive layout

Every screen must adapt to its available width. Desktop designs must not simply be squeezed into Mobile.

Mandatory validation sizes:

| Name | Width | Height |
|---|---:|---:|
| Small Mobile | 360 | 800 |
| Standard Mobile | 390 | 844 |
| Large Mobile | 430 | 932 |
| Tablet | 768 | 1024 |
| Landscape / Small Web | 1024 | 768 |
| Laptop | 1366 | 768 |
| Desktop | 1440 | 900 |
| Large Desktop | 1920 | 1080 |

At all governed widths:

- horizontal page overflow is prohibited;
- cards/grids must collapse/reflow;
- form controls must remain inside their container;
- text must wrap rather than push the viewport wider;
- genuinely wide tables may use their own horizontal scroll region.

## 4. Vertical reachability / no-freeze rule

No screen may vertically freeze or make lower content unreachable.

Order of implementation preference:

1. natural adaptive document flow;
2. normal page vertical scrolling;
3. an explicit internal vertical scrollbar only for a genuinely bounded panel;
4. never clip lower page content merely to fit a viewport.

Mandatory rules:

- use `min-height: 100dvh` rather than fixed `height: 100vh` for page-level layout;
- primary application containers must not use a fixed height that clips content;
- primary page containers must not use `overflow: hidden` to suppress vertical overflow;
- mobile safe-area bottom padding must keep the final control reachable;
- sticky/fixed actions must never cover the last content;
- if content is taller than the viewport, the user must be able to scroll to the actual bottom.

A scrollbar is an acceptable fallback when a bounded component genuinely requires one. Frozen or unreachable content is never acceptable.

## 5. Shared shell

The shared `AppShell` owns:

- global logo/navigation;
- user identity and Sign Out;
- neutral workspace role context;
- the governed background foundation.

Operational pages must not reintroduce Project, Dealer or Outlet context into local breadcrumbs.

## 6. Build enforcement

The policy is enforced in three layers.

### Static governance gate

`npm run ui:governance` executes `scripts/ui-governance-check.mjs` and fails when mandatory source-level rules are violated.

Both standard and native builds run it automatically:

```text
npm run build
npm run build:native:dev
```

`Web CI` also runs the governance gate explicitly.

### Responsive visual gate

`.github/workflows/visual-validation.yml` validates:

- public/auth screens;
- the actual authenticated Workspace-selection component;
- the actual authenticated Landing Page;
- actual Booking Step 1 and Booking Step 2;
- all eight mandatory viewport sizes;
- horizontal overflow;
- vertical reachability;
- Mobile input sizing;
- governed navy/teal background;
- absence of Project Name in operational views;
- Dealer/Outlet visible on Landing and absent in Booking.

Authenticated tests use deterministic mocked API responses, not live customer/business data and not production credentials.

### Deployment smoke

A successful deployment does not override a failed governance check. UI acceptance requires the applicable governance and build checks to pass.

## 7. Change control

Any intentional exception to this contract requires an explicit documented design decision. A developer must not weaken `ui-governance.css`, disable the governance script, or remove responsive validation merely to make a build pass.

When a screen cannot fit naturally, the correct response is to reflow it or make it scrollable—not to clip it.
