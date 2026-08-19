# Verigence — Session Handoff

## Purpose

This note captures the agreed working method before resetting the session. It is intentionally stored on the non-deployment branch `planning/uc-001-user-onboarding` so Cloudflare and `main` are not touched.

## Restart point

When work resumes, start from scratch with:

**Use Case 1 — User Onboarding**

Do not continue implementing the current Web screens first. The first task is to design and approve the complete User Onboarding use case specification, sequence diagram, and mockups/wireframes.

## Agreed development method for every use case

Every use case must follow this order:

1. Full use-case specification
   - actors
   - trigger
   - preconditions
   - business rules
   - happy path
   - alternate paths
   - exception/error paths
   - data requirements
   - API/service requirements
   - security/authorization considerations
   - audit/evidence requirements where applicable

2. Sequence diagram
   - show the participating actors/components explicitly
   - Web/Mobile, Audit Core, Security, DI, database/services as applicable
   - distinguish runtime business scope from deployment configuration

3. Wireframes/mockups
   - all screens required for the use case
   - desktop and mobile when applicable
   - normal, loading, empty, error, pending and success states where relevant
   - use approved Verigence branding

4. User design approval
   - once approved, the mockup becomes the UI contract
   - do not invent fields, internal IDs, roles, tokens, labels, layouts or alternative flows during implementation
   - if an implementation gap is found, return to design review first

5. Implementation on a feature branch
   - never develop directly on `main`
   - `main` is the deployment-approved branch because Cloudflare watches it

6. Local testing before deployment
   - typecheck
   - production build
   - local runtime test
   - functional flow test
   - API integration test
   - visual comparison against the approved mockup
   - capture local screenshots for review

7. User implementation approval
   - locally rendered implementation must be shown/verified before merge

8. Merge to `main` only after explicit approval to deploy

9. Cloudflare deployment after merge

## Important product/design rules already agreed

- Verigence Web is a single application. Tenant, Dealer and Outlet are runtime business context, not Cloudflare/Vite build variables.
- End users must not be asked to enter internal Tenant ID, Dealer ID or Outlet ID.
- End users must not be asked to paste JWT/security tokens or choose their own application role on Sign In.
- Role and business scope are assigned/authorized by the appropriate approval/admin flow.
- User-facing onboarding uses a Verigence Key / onboarding key concept rather than exposing internal platform identifiers. The exact final terminology will be finalized in UC-001.
- Current structural Web screens may be used as reference, but UC-001 will be redesigned/documented from first principles before further implementation.
- No changes to Audit Core, Security, DI or other modules while working on Web unless separately agreed.

## Verigence branding baseline

Use the approved blue/teal identity from the shared wireframes:

- Deep Blue `#003A82`
- Electric Blue `#0057B8`
- Teal `#00AFA8`
- Mint `#00D3A7`
- Mist `#F4F8FB`
- White `#FFFFFF`
- Slate Text `#1F2937`
- Approved blue/teal Verigence `V` mark + `VERIGENCE` wordmark

The approved wireframes/mockups are the branding source of truth. Do not reconstruct or reinterpret the logo.

## UC-001 initial scope to start with after reset

**Use Case 1: User Onboarding**

Initial flow to analyze and design, subject to detailed review:

`Landing / Sign In → Create Account → Identity Verification → Registration Pending → Super Admin / Authorized Approval → Account Activation → Sign In → Runtime role & business scope`

The exact fields, rules, notifications, approval roles, password/OTP behavior, Verigence Key semantics, duplicate-user handling, rejection/resubmission behavior, expiration and security rules must be specified before implementation.

## Deliverables expected for UC-001 before any code change

- `01-use-case-spec.md`
- `02-sequence-diagram.md`
- `03-wireframes/` or one consolidated approved design board
- `04-api-data-mapping.md`
- `05-test-scenarios.md`
- design approval record

## Current repository/deployment state

- Repository: `verigence/verigence-web`
- Deployment branch: `main`
- Planning branch created for next work: `planning/uc-001-user-onboarding`
- Cloudflare deployment should not be triggered by planning/feature branch work.

## First instruction for the next session

Read this handoff note and begin **UC-001 User Onboarding specification only**. Do not implement or deploy anything until the use-case specification, sequence diagram and wireframes have been reviewed and approved.
