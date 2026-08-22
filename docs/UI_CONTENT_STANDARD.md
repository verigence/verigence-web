# Verigence Web — User-Facing UI Content Standard

## Purpose

Verigence screens are for business users. User-facing UI must explain the task, decision, status, or next action in business language only.

## Non-negotiable rule

Do **not** expose technical implementation details or internal delivery/process language in the UI.

This includes, but is not limited to:

- backend or service names such as Security, Audit Core, DI, Worker, Cloudflare, Railway, Clerk, database, API, endpoint or upstream;
- use-case/internal delivery codes such as UC01, UC02, W1, W2, internal workflow/state-machine names or reconciliation terminology;
- raw exception messages, HTTP status text, error codes, stack traces, correlation IDs or backend problem details;
- internal identifiers that are not required by the business user, including tenant IDs, operation IDs, UUIDs, version IDs and generated technical codes;
- implementation notes such as deferred controls, temporary text-box decisions, technical provisioning steps, immutable backend rules or module ownership;
- environment/data-source badges intended for developers or support staff.

## User-facing wording

UI copy should answer one or more of these questions:

1. What am I doing?
2. What information do I need to provide?
3. What happened?
4. What do I need to do next?

Prefer short, task-oriented wording such as:

- `Project created successfully.`
- `Please check the information and try again.`
- `Complete the required Project details before continuing.`
- `Dealer added successfully.`

Avoid wording such as:

- `Audit Core returned...`
- `Provisioning operation...`
- `Security Tenant...`
- `HTTP 409 / CONFLICT...`
- `Reconciliation required...`

## Error handling

Raw backend errors may be logged for diagnostics, but must not be rendered directly to a user. Translate errors into safe, actionable categories such as validation, permission, conflict, unavailable service, or general retry.

## Visual consistency

Authenticated UI colours, typography, shell and component styling are governed by `src/styles/shell-ui-fixes.css`. User-facing visibility/content guardrails are applied last through `src/styles/user-ui-guardrails.css`.

Any new screen should follow both before it is considered UI-complete.
