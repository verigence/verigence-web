# Verigence Brand Baseline

## Source of truth

The approved Verigence Web & Mobile wireframes shared on 17 Aug 2026 are the visual branding baseline for the Web application.

The approved identity uses:

- the blue/teal stylized `V` mark shown in the wireframes;
- the `VERIGENCE` wordmark in Deep Blue;
- Deep Blue `#003A82`;
- Electric Blue `#0057B8`;
- Teal `#00AFA8`;
- Mint `#00D3A7`;
- Mist `#F4F8FB`;
- White `#FFFFFF`;
- Slate Text `#1F2937`.

## Approved Web assets

The Web implementation uses branding assets derived directly from the approved wireframe reference:

- `public/brand/approved/verigence-lockup.svg`
- `public/brand/approved/verigence-mark.svg`

Do not substitute a reconstructed shield, waveform, navy/gold identity, or another logo treatment.

## UI governance

The mandatory cross-screen implementation and responsive rules are defined in:

- `docs/UI_GOVERNANCE.md`
- `src/styles/ui-governance.css`
- `scripts/ui-governance-check.mjs`

The governed application/page background is the navy-to-teal Sign-in background. Pale/sky-blue application backgrounds are not permitted. Operational Project Name visibility is prohibited, and Dealer/Outlet names are Landing-page-only. All screens must remain adaptive and vertically reachable.

## Change-control rule

Branding changes must not alter screen fields, flow, typography sizing, layout, spacing, or functional behavior unless those changes are separately approved. UI changes must also comply with `docs/UI_GOVERNANCE.md`; build or deployment success does not waive governance requirements.
