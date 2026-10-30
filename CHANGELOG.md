# Verigence app changelog

Every change that reaches the Android app is written here, in simple English, under **Unreleased**.
When a release is made, run `npm run release:version -- 1.1.0` (use the next number). It moves
everything under Unreleased to that version and sets the same version in `package.json`. Commit
both, then run **Publish Verigence Android App**. The release workflow refuses to publish a version
that has no notes here, shows these notes as the release note, and tags the commit in Git.

Version numbers: the first number for a big change, the second for new features, the third for fixes.
Version 1.0.0 (written "1.0") is the first release, published on 05 October 2026.
The app's build number is added by the release workflow and is not written here.

## [Unreleased]

### Added
- SuperAdmin, Reports: an "App" tab — who has the Verigence Android app and which version. Per person: whether they downloaded it, when, how many times, which version they took, and the version their app reports when it signs in, with a count of how many people are on each version and a CSV. Expanding a person shows every download with its date and version.


## [1.4.0] - 2026-10-30

### Added
- Journey 360: an "Audit summary" tab, prepared when opened. One page with every financial fact of the journey: what the customer owes, benefits given, products sold (insurance, extended warranty, RSA, FASTag, accessories), how it was paid (receipts, loan, bank statement check, exchange, scrappage, credit notes), the settlement and the documents that disagree. Each line has a conclusion and the rule it rests on, and the journey a verdict: Clean, Exceptions found or Incomplete.
- Reviewer: "Complete delivery" on a booking completes a delivery the rules have not, with a reason. What was still missing is recorded, and the Team Lead reviews it next.

### Changed
- Bookings & Deliveries, Vehicle photos: "Choose photos or PDF" also takes PDF files — at most 3 PDFs per booking, each up to 50 MB, stored as they are. A larger PDF, or a fourth one, is refused with a message saying why (the file's size, or how many are already added).
- Journey 360, Audit summary: shown only once delivery has started (a booking has no audit summary). New section "Documents required to complete the file": every mandatory document, and each conditional one with why this deal needs it, marked On file or Missing, missing first; a missing one makes the verdict Incomplete.
- Journey 360, Audit summary: on a financed deal the loan is taken from the finance record, else from the NDC or the dealer's settlement printout, and says which. With no loan amount on file the settlement says it cannot be judged instead of showing the loan as a shortfall. Refunds on the settlement printout are shown and deducted.
- Journey 360, Deal: the dealer's ERP settlement printout gives TCS, insurance, registration and the add-on charges; the vehicle price and discounts (before GST on that printout) stay with the cost sheet.
- Document review: a PC's correction now applies at once, at any confidence. It no longer waits for a Team Lead; the Team Lead and Reviewer are informed. The note on a confident reading is optional.
- Daily gate pass, all outlets: a gate pass not uploaded or not finished by the PC is highlighted, and clicking an outlet opens its gate pass.
- Documents: a page that failed, was removed or is a copy of a page already uploaded no longer shows a card (it showed "Uploaded · removed…" or "Uploading…" with a spinner). The "Document to resubmit" or scan-quality task names the pages to upload again, and the checklist shows Missing until they arrive.
- Deal: the NDC / Cost sheet column; a booking with no NDC shows the cost sheet's figures, named as the cost sheet's.
- Tasks: tasks of one kind on a booking are shown as one entry.
- Tasks: the note button reads "Add note (task stays open)"; a note alone does not close a task.
- PC, Team Lead and PM: the old Task Queue, old Duplicate Bookings, Rule Catalog and old journey review screens are gone from the menus and the mobile bar; old links open Booking & Delivery or its Task Queue. The Team Lead home's Task Queue card counts Booking & Delivery tasks.
- Daily gate pass calendar: each day shows deliveries reported, uploaded with that day's gate pass, not intimated to the PC, and still to upload (what the PC has to upload); the month totals show the same.
- The app sends the time used minute by minute and the screens opened, for the Executive's engagement report. Nothing changes on the employee's screen.

## [1.3.2] - 2026-10-27

### Added
- Daily gate pass: up to 4 photos for one gate pass, for a gate-out register that runs over several pages. Each page opens on its own.
- Daily gate pass on Monday: the PC says whether Sunday and Monday are on the same photo or on separate photos; with separate photos, each day gets its own photos and its own counts.

### Changed
- Daily gate pass, all outlets: grouped by dealership with a sub-total for each, showing who uploaded each gate pass instead of the Team Leads.

## [1.3.1] - 2026-10-27

### Added
- Daily gate pass: the Team Lead (outlets under them), PM and Executive see all onsite outlets together, with As per Gate out Register, Updated in Tool, Pending due to Client and Pending due to PC, by day and in total.
- Daily gate pass: a photo already taken can be uploaded instead of opening the camera.

### Changed
- Daily gate pass photos are no longer refused for size, blur or light. Every photo is kept; the server checks blur and clarity, tells the PC if the photo looks blurred, dark or washed out, and shows it to the Team Lead.
- The daily gate pass is for onsite outlets only; satellite outlets no longer get the task.

## [1.3.0] - 2026-10-27

### Added
- Task Manager: tasks not tied to a booking, raised to the right roles (PC, TL, PM, CRM, Reviewer) with an expected time to close, reviewed by the person who raised them. Executives and SuperAdmin can set up recurring tasks.
- Daily gate pass task for each outlet, closed by the system once the gate pass is finished.
- Task Queue has two classifications: Journey tasks (grouped by document) and Task Manager tasks, with one badge for both.
- Daily status of Journey tasks and Task Manager tasks, with overdue, missed and incomplete flagged.
- Employee engagement (Executive and SuperAdmin): time on Verigence, sessions (shortest, average, longest), files, bad scans, tasks and on-time share, by day, week or month.
- DI dashboard (Executive and SuperAdmin): files and pages, read first time or after retries, bad scans, failures and why, links to failed pages, processing time and file size.

### Changed
- Daily gate pass: the screen names the day the gate pass is for. Sunday is off, so Monday's gate pass covers Sunday and Monday in one photo. If the previous day's gate pass is still owed, the screen asks which day the photo is for.
- Daily processing no longer shows the Document Intelligence sections; they are on the DI dashboard.
- Role names are shortened (PC, TL, PM, CRM, Reviewer, Exec).

## [1.2.0] - 2026-10-26

### Added
- Daily Gate Pass screen: the Process Coordinator uploads the day's gate passes and reconciles them, there is a monthly calendar, and the Team Lead sees the daily tasks.
- Daily processing: large uploads are highlighted, the document status is shown per Process Coordinator, uploaded files have links, and the work done is shown per Process Coordinator and Team Lead.
- A SKU work screen that a Team Lead and a Reviewer both use.
- Reports: a SuperAdmin Reports tab with the Journey review.
- Discount variance tab: invoice discounts that differ from the entitlement, with category, Process Coordinator, outlet, customer and car model.
- Analytics: dealer and outlet model sales, a dealer-wise PIN and district dashboard, a map with counts and outlet pins, and sales and VAS insights. Insurance, accessory and extended warranty insights now point to actions. Analytics is refocused on dealer and outlet decisions.
- Booking VAS proposals are reconciled to the purchases on the delivery invoice.

### Changed
- Booking & Delivery: a Process Coordinator can filter the list by outlet, and a new booking offers the Coordinator's outlets as a radio list.
- Excess discount tab: shows only discounts above the entitlement, and where they were given.
- A page that was refused or failed can be removed from the booking (its card, placeholder and image-quality task).

### Fixed
- The Discount variance tab was missing inside a Project; it is shown now.
- The Daily Gate Pass upload form is shown by the Project's operating role, not the role the app starts with.

## [1.1.0] - 2026-10-19

### Added
- Employees page shows how many employees there are, how many are active, and how many have a Verigence login.
- "Sync with Verigence" on the Employees page creates the missing Verigence logins (five at a time) and links the ones that already exist.
- Employee status is now Active, Suspended, Terminated or Quit. Only the CEO and SuperAdmin change a status at once. When HR Admin asks for a change, it waits until the CEO approves it. A login is suspended when an employee is no longer active.
- Daily attendance has filters: checked in, checked out, checked in and out, in but not out yet, not checked in, on leave, delinquencies, needs approval.
- Housekeeping: SuperAdmin can delete an employee added only for testing. It is refused if a payroll or a paid reimbursement used the person.
- The app now tells the server which version it is, so the login report and the device diagnostics show it.
- Face match: HR sees "Face does not match" when the face in a check-in or check-out photo is not the employee's. It is compared with the profile photo; if there is none, the check-out is compared with the check-in photo of the same day. It is only a flag, never a refusal. HR also sees the match score (1 is identical) next to each check-in and check-out time; nothing acts on it.
- On the profile page you can take a selfie for your profile photo. The Attendance page reminds you to add your photo if you have not.
- If you have My HR but no Audit workspace, the app now opens My HR. It no longer stops at "No active workspaces are currently assigned to you". The workspace and work-location screens also have an "Open My HR" button.
- Daily attendance refreshes by itself every minute and when you come back to the screen. It has a Refresh button and shows when it was last updated.

### Fixed
- If your assignment changed since you last signed in, the app no longer keeps showing the old dealership. It checks your current assignments again, so the dealership you see is the one you are assigned to now.

### Changed
- If you work in more than one outlet, you now start in your ONSITE outlet and switch to your other outlets from the list in the side menu. The switch happens in place, also when the outlets belong to different dealerships. There is no "choose a work location" screen first.
- When you hold assignments the side menu cannot switch between (for example Team Lead in one project and Process Coordinator in another), the "Choose Dealership" screen now names the dealership. It no longer says "Workspace 1" and "Workspace 2", and the word Workspace is gone from these screens.
- On "My employee profile" you can now also change your gender. Your name (as on Aadhaar or PAN), role, designation, department, date of joining, date of birth, experience, PAN and Aadhaar stay with HR. If your name is spelt wrongly, ask HR to correct it.
- To change your email or mobile you send a request to HR from "My employee profile". HR sees the old and the new value and approves or rejects it. Nothing changes until HR approves. Employees page shows the waiting requests to HR.
- Changing an employee's e-mail or mobile number in HR also changes it on their Verigence login. The login, the roles and the password stay the same.
- A new login made by HR for an employee is ready to use. It no longer waits for SuperAdmin approval.
- The status can no longer be edited in the Edit form.

## [1.0.0] - 2026-10-05

The first release of the Android app, published on 05 October 2026. Earlier changes are in the Git history.
