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

### Changed
- Discount control's outlet chart is now a bubble chart: right is more business billed, high is a larger share given away, the bubble is the rupees given, the dashed line is the network — an outlet high and to the right costs the most. Business overview's month chart now draws deliveries as a line over the booked bars.
- Every Analytics report now opens with charts, and its tables sit under them as the detail: bookings and deliveries by month, bookings by outlet and stage, and billed value by model (Business overview); discount by verdict, by type, by outlet against the network, and the reasons an entitlement is unknown (Discount control); penetration by product and by dealership (Product penetration); in-house against outside, premium going outside by agent, insurers, covers and renewals (Insurance); financiers, finance share by outlet, loan against ex-showroom and loan size (Finance); old-vehicle states, road tax with and without a certificate, certificate share by outlet (Scrappage); payment modes, cash share by outlet, and cash receipts at and near ₹2 lakh by outlet (Payments and cash); customers by district and dealership (Customer catchment).
- On the customer map each outlet is now a pin in its dealership's colour with its name beside it; **Outlet names** turns the names off.
- **Customer catchment** has the customer map back, now on live figures: Odisha by district or PIN code, each area in the colour of the dealership with the most customers there (within one dealership, the outlet), stronger where there are more customers, with a dark outline where more than one dealership sells into the same area and each outlet marked at its own PIN code. **Show** switches the map between bookings, deliveries and the share of deals that took finance, in-house insurance, accessories, FASTag, RSA, extended warranty or a scrappage certificate; **Model** follows one model. Beside it, the busiest areas are split by dealership. The district of a customer now comes from the PIN code where the postal directory knows it.
- Analytics is rebuilt. It now has eight reports, opened from one **Sales analytics** menu item and shown as tabs on one page: **Business overview** (booked, delivered, billed value, days from booking to delivery), **Discount control** (discount given against ex-showroom, how much is over entitlement, kit given as cash or cannot be judged yet and why, which outlets and models give more than the rest, the largest discounts, and what was decided on the discount tasks), **Product penetration** (finance, in-house insurance, accessories, FASTag, RSA, extended warranty and scrappage certificate by outlet, dealership, model and district, also compared with the network for the same models), **Insurance** (in-house against outside, the agents the outside policies went through, insurers, add-on covers, renewals falling due), **Finance** (financiers, loan amount, loan against ex-showroom, sanctioned against disbursed), **Scrappage** (certificates used, where the old vehicles were registered, road tax saved, certificates used on more than one booking), **Payments and cash** (payment modes, cash share, and cash receipts above, at exactly and just under ₹2 lakh) and **Customer catchment** (customers and products by district and PIN code, and each outlet's home district).
- The reports read the bookings and deliveries as they stand now, not last night's copy, and the discount figures are the same verdicts the Deal tab and the Excess discount list show. One row of filters (dealership, outlet, booking dates, with This month / Last month / All dates) applies to every report and stays as you move between them. Every table can be sorted and downloaded as a CSV file, and each booking in a list opens in Journey 360. An outlet or model with fewer than 10 deals is marked "Few deals".
- Analytics is for Team Leads, Project Managers and Executives, over the outlets they are mapped to. It is no longer in a PC's menu, and it is not shown on a service audit Project.
- My HR > Attendance Overview, Daily: the day now opens with a quick summary that fits on one screen. One row of figures shows present out of expected, not checked in yet, absent, late check-ins, early check-outs and on leave. Under it, everyone absent or not checked in so far is listed by name, project by project, with their role and outlet. Absent and not-checked-in-yet names are kept apart, and people on leave or with the morning off are shown separately. Tap a name to open their calendar. A long list scrolls inside its own box. One line gives the first and last check-in and check-out of the day, and after the standard check-out time it also shows how many are still checked in.
- Below the summary, each project has its own section, closed until you open it (or "Expand all"). Its header shows present out of expected, late, early out, not checked in and the first-to-last check-in time. Inside: who did not check in, the check-in figures (first in, last in, each late check-in with how late against the standard check-in time, check-ins away from the outlet), the check-out figures (first out, last out, each early check-out with how early, who has not checked out) and then the full list. Someone on two projects is listed under both, marked Shared, and counted once in the summary. The weekly view is unchanged.

### Removed
- The earlier Analytics screens (overview, sales and product, add-ons, turnaround, geography, trade-in, audit and compliance, documents, employees). What they showed is now in the reports above, or already in Booking & Delivery's own reports (Excess discount, Missing documents, Daily processing, Employee engagement). Old links to them open the report that took their place.

### Fixed
- Reached the outlet (Attendance Overview and the dashboard's Team today card): on a half-day holiday with the morning off, people are shown as "Morning off" until the afternoon starts, not as "not checked in yet"; they are expected from the half-day split time.

### Added
- Location checks (Executive, and SuperAdmin in Reports > Location checks): a new **Away more than 5 km** view lists, date by date, every time DealGuard's location check found a PC more than 5 km from their nearest outlet. Each line shows the time, the PC and roughly how far they were, for example "~5.6 km from Utkal Mahindra – CDA". A small table at the top shows, for each PC, how many times and on how many days they were away, the furthest distance and when they were last seen away. You can choose the dates (This month by default; the quick picks are Last 7 days and Last month; up to 93 days) and the distance (1, 2, 5, 10 or 25 km). The list can be downloaded as a CSV file. A reading too inaccurate to place the PC (usually a computer) is never counted as away.
- Team Leads, Project Managers and Executives can see who of the team has reached the outlet today, without asking. In My HR > Attendance Overview (Daily), the check-in column now shows the time, the outlet and "At outlet" or "Away 2.4 km" (from the check-in's location and the outlet's 500 m limit). For today, a "Reached the outlet today" summary at the top counts who reached the outlet, who checked in away from it, who has not checked in yet (with their names) and who is on leave. Sort the list by check-in time with the column header (on a phone, the "Sort by check-in time" button). Today's view refreshes itself every 3 minutes while it is open.
- Dealer operations dashboard (Team Lead, Project Manager, Executive): a "Team today" card shows how many of the team have reached the outlet (for example "7 of 9"), the first and latest arrival, who is away from the outlet, who is on leave and up to five names of those not checked in yet. It opens Attendance Overview for the Project. If My HR cannot be reached, the card says so in one line and the rest of the dashboard works as before.
- Executive and Project Manager: your landing page (Overview) is now the dealer operations dashboard the Team Lead has — the month's bookings and deliveries, the summary figures, the Dealership-wise, Outlet-wise and PC-wise panels and the full journey list with its tabs, of the current calendar month by default. Cards at the top open the Project Tracker (today's files uploaded, delivery files closed and gate pass missing) and, for a Project Manager, the Task Queue, or for an Executive, the Task Manager. A Project Manager's Booking & Delivery menu item and page are unchanged.
- Team Lead, Project Manager and Executive journey list: a **Dealership** filter and a **Dealership-wise** panel when the Project has more than one dealership. The Outlet choices then show that dealership's outlets only. The Team Lead dashboard also has a Project Tracker card.
- Team Lead, Project Manager and Executive journey list: search as you type. After two letters (or three digits of a mobile number) up to 8 matching bookings and deliveries show under the search box: the customer, the mobile number (last four digits only), the dealership and outlet, the PC, and whether it is a booking or a delivery with its date. Click one (or use the arrow keys and Enter) to open it in Journey 360. Press Enter, or choose **Show all results**, to show every match in the list. Escape closes the suggestions. They follow the filters already chosen (month, dealership, outlet, PC, Booking / Delivery).
- Team Lead, Project Manager and Executive journey list: a **Booking / Delivery** filter — All, Bookings only, Deliveries only. A booking counts by its booking date and a delivery by its delivery date (delivery started or delivered), the same as the month's "Bookings in" and "Deliveries in" figures. The tab counts follow the filter.

### Changed
- Journey search finds a customer by their full mobile number or any part of it (five digits or more), however it is typed: spaces, dashes, +91 and a leading 0 are ignored. Four digits still find the number's last four. Searching by the customer's name works as before.

## [1.6.5] - 2026-11-09

### Fixed
- Sign in: when your access is paused (for example, approvals waiting with you passed the Monday 09:00 deadline), the sign-in screen now says so and tells you to ask SuperAdmin to restore it, instead of "Sign in could not be completed. Please check your details".

### Changed
- Time on Verigence counts real work only: a minute is active when there was a click, tap or key in it or in the reading window before it (3 minutes by default — the time spent reading a screen after a click). Scrolling or the mouse wheel alone no longer makes a minute active: it is counted as idle and shown apart as "scrolling only". On a phone, a touch counts as a tap only when the finger comes up where it went down (within 10 px, within 1 second); a touch that starts a scroll is not a tap. The app reads the reading window from the server when it starts, every 3 hours and with every minute's send, and uses 3 minutes when it cannot.

### Added
- SuperAdmin System health: set the reading window of time on Verigence (1 to 10 minutes) for every Project or one Project; every change is listed with who made it and when.
- DealGuard **Project Tracker** for Team Leads, Project Managers and Executives: the situation of the whole Project for a day, a week (Monday to Sunday) or a calendar month. Summary tiles at the top, then a table by dealership, outlet and PC (open a row to see the next level, click a column to sort) with gate pass (registers due, on time, late, missing, the counts entered), files uploaded (journeys, bookings, deliveries, files, pages), files closed (delivery files closed, closed by Reviewer), tasks (raised, closed by the PC, by the Team Lead / PM / Executive or by the system, open and overdue) and recurring tasks (one set of columns per schedule, the daily gate pass today; new schedules such as a DMS or payment reconciliation appear on their own). Figures link to Daily gate pass, Task Queue, Task Manager and Bookings & Deliveries. The period is in the page address, so a link opens the same view.
- Daily processing opens a given day from a link (`?day=`).
- Project Tracker is the one place for Team Leads, Project Managers and Executives: tabs **Project tracker**, **Daily processing** and **Daily gate pass**. The Daily processing tab shows the day picked on the tab (the tracker's date carries over); the Daily gate pass tab has the Team Lead's daily tasks, the consolidated view and the calendar with each outlet's registers, each with its own date controls. Gate pass figures on the tracker open the Daily gate pass tab. The separate "Daily processing" and "Daily gate pass" menu items are gone for these roles; old links open the matching tab. The PC's Daily gate pass (upload and edit registers) is unchanged.
- SuperAdmin System health: a **Data archive** tab — red, amber or green (red when a run of the last night failed), every archive run per night and Project (table, mode, status, candidates, archived, files, duration, error), the last successful run, rows archived to date, the size of the archived table now and the archive settings (bucket, retention, age limit, live switch; never a key).
- Team Lead dashboard: the summary, the Outlet-wise and PC-wise panels, the tabs and the journey list show the current calendar month by default (India time) — bookings by their booking date, deliveries by their delivery date. A month picker shows other months, or all months. Two new figures: bookings and deliveries in the month. The PC's own pages and the Booking & Delivery list are unchanged.

## [1.6.4] - 2026-11-07

### Fixed
- **Keep me signed in now works in the Android app.** Until now the app never saved the sign-in on the phone, so people had to type their password again every time the app was reopened or had been in the background. After updating, sign in once with "Keep me signed in" ticked; after that the app opens signed in, and when it comes back from the background it signs in again by itself.
- Only the **Sign out** button forgets "Keep me signed in". The app no longer forgets it when the sign-in runs out, when access is paused for a while, or when the network fails. It is forgotten only when you sign in on another phone (or Security ends the sign-in for another reason).

### Changed
- Choose Dealership: each card names the Project (and the dealerships for a PC) and shows the role you hold there, instead of "Assignment 1, 2…".
- Attendance correction: a request can be raised only for a day of the current calendar month. Days of an earlier month no longer offer it.
- You can stay signed in on one phone (the app) and one PC browser at the same time. Signing in on another phone signs out the previous phone; signing in on another PC signs out the previous PC.

## [1.6.3] - 2026-11-07

### Changed
- myHR leave: special occasion leave is now **Birthday leave**. It opens on your birthday and can be taken that day, or any later day until the day before your next birthday; it cannot be taken before your birthday and does not carry over to the next one. For someone who joined after their birthday, it opens on the first birthday after joining. No occasion needs to be typed any more. The balance card says "Available from … to …" or "Opens on …"; without a date of birth in myHR it says to ask HR to add it.
- Leave taken in the previous 6 weeks (shown when applying and to the approver) now counts only days already taken: approved leave still to come is left out.

### Added
- myHR holidays: HR or SuperAdmin can make a Sunday a working day for chosen projects (or outlets, or everyone). Choose **Working Sunday** when adding a holiday; only Sundays are allowed. For those people it is a normal working day: Today and the attendance calendar say "Working Sunday", the usual check-in rules apply, and it counts for leave, payroll and earned leave. Everyone else keeps the Sunday off. A working Sunday and a holiday for the same people on the same date are refused.
- Leave: when someone applies for leave, they and their approver see how many paid and unpaid leave days were taken in the 6 weeks before the leave's first day (Team Lead, Project Manager and HR approval lists, and HR's view of a person's pending requests).

### Changed
- Earned paid leave: a half-day holiday that was attended counts as half a day towards the 22 days, not a whole day.

## [1.6.2] - 2026-11-07

### Added
- myHR holidays (HR or SuperAdmin, Settings → Holidays): a holiday can now be a full day or a half day (morning off or afternoon off), and for the whole company or for chosen projects and outlets. The list shows each holiday's day part and who it applies to; removing one asks first and keeps it in the history.
- On a half-day holiday the other half is a working day. Today's attendance card says which half is off and from when (for example "Half-day holiday (afternoon off from 14:00): Diwali eve") and shows that day's times. The attendance calendar marks the day "AM off" or "PM off".
- Working the holiday half goes to the Team Lead for approval and earns half a comp-off day.
- Apply for leave: half-day holidays in the chosen dates are listed and count as half a day. Half-day leave on a half-day holiday is not possible; apply for a full day instead.
- HR daily and team views name the holidays of the day, including those for some projects or outlets only. A holiday for a project or outlet is shown only to the people it applies to.

## [1.6.1] - 2026-11-07

### Changed
- Daily gate pass: the PC now picks the date the gate register is for, every time. Any day from today back to 7 days ago can be chosen (Sunday is off, so its register goes with Monday's). Each date shows whether a register is already uploaded and whether it can still be changed.
- Daily gate pass: a register already uploaded can be opened and changed for 3 days after its date: add a photo, remove a photo, or replace all the photos. Older registers are locked and say so. Removed and replaced photos are kept in the history.
- Daily gate pass: a register uploaded late for an earlier day still completes that day's gate pass task, marked as done late.
- A journey's **Actions** menu (Bookings & Deliveries) has **Download uploaded PDF**: the full file the PC uploaded downloads at once; if the PC uploaded several, a short list opens to pick from.
- **Export to Excel** has its own item in the DealGuard menu for Team Leads, Project Managers and Executives. Before, it was only on the Booking & Delivery page, which Team Leads and Executives do not open.
- A journey's Documents page has a third tab, **Uploaded files**: each file exactly as the PC uploaded it (the full PDF), to download. Journey 360 links to it even while the customer's KYC has not been read.

## [1.6.0] - 2026-11-07

### Fixed

- Keep me signed in now works while the app stays open: when the app comes back from the background after a while, you carry on where you were instead of landing on the sign-in page.
- When a PC says a missing document is not mandatory, the Reviewer (or Team Lead, PM) can now accept or reject it right on that task. Before, the task only said it was waiting for the Reviewer and had no buttons.
- Close journey (Reviewer): the open items are read again before closing. If an item opened while the form was open, it is named and gets its own answer box, instead of the close failing with "Business validation failed".
- Tasks: the Team Lead's "Reviewer closed the journey" task is labelled "Closure to accept" (it was "Check failed"); delivery review and closure rework tasks have their own labels too.
- A page refused for image quality (faded, blurred, small) that you can read can now be sent as it is: press "… is fine — read it" on the task or the document card, or upload the same page again. It is read, and the scan scores are kept.

### Added

- Night control: from 20:00 to 08:30 (India time) Journey 360 is closed and no Verigence file can be downloaded, unless SuperAdmin has given you access. Journey 360 shows "Night Mode On" instead of the page, and a download shows a small "Night Mode On" note. SuperAdmin and Executive are never blocked. The Android app can always be downloaded from the app download page.
- Night Control (SuperAdmin, under Administration): switch night control on or off for each feature (Journey 360, file downloads) and set its start and end times; see who has access at night; give a person access to one feature or all of them with a note; remove access with a note. Access stays until it is removed.
- My HR > Attendance has **My calendar**: each day's status (present, absent, leave applied or approved, waiting, half day, day off) with the hours you clocked, the total for every week and for the month.
- You can ask for a past day to count as a full day or a half day (**Request attendance correction**); your Team Lead or Project Manager approves it under Approvals > Corrections.
- **Attendance Overview** for Team Leads, Project Managers, Executives and HR: everyone on your projects, day by day or week by week, with hours per day and the week's total. People who work on more than one project are tagged Shared.
- Announcements can carry a picture (a poster or a graphic).
- Sign-in locations (SuperAdmin and Executive): where each PC, TL and PM opens Verigence from, until 22 Nov 2026: how often at their tagged outlet (within 500 m) and the three other places they open it from most, with an address.
- Journey 360 has an **Uploaded files** tab: every file uploaded to the journey, as it was uploaded (the full PDF or photo), with who uploaded it and when, and a Download button.
- Team Leads, PMs and Executives can export journeys to Excel from Booking & Delivery: by booking, delivery or upload date, by dealership or outlet, or all. The workbook has the Deal Audit columns (standard, actual and variance per charge and discount, and payments), and is built in the background with a Download button when ready.

### Changed

- When a request is refused because of night control, the screen says "Night Mode On" instead of an error code or "You do not have access".
- No check-in by 5:00 pm on a working day: the day is marked Absent by the system and check-in is closed for that day (raise a correction if you were at work).
- A day with less than 5 hours between check-in and check-out needs a reason and goes to your Team Lead; your Project Manager is informed.
- DealGuard "Location checks" is now shown to the Executive only (and to SuperAdmin under Reports); Team Leads and Project Managers no longer see it.
- Excess discount has three tabs: Over entitlement, Kit given as cash (an accessories kit the scheme gives in kind, passed on as a cash discount) and Entitlement unknown (a discount with no master to compare with, and why). Each tab has the same filters, totals, breakdowns and Journey 360 link.
- Excess discount is redesigned. You can filter by booking or delivery date (with This month, Last month and Last 30 days), dealership, outlet, discount type, PC and the document the figure came from, and search. Active filters show as tags you can remove one by one. The totals and the breakdowns by discount type, dealership and outlet follow the filters. The table sorts by any column, pages, exports to CSV, and every row opens its Journey 360.
- The compliance report is now the Audit report. Right after the verdict it shows the journey closing summary: who closed it and when, the closing comment, every open item with the Reviewer's answer, and the Team Lead's decision. Once delivery has started it also shows the full Audit summary, line by line.
- Booking & Delivery: Actions has "View uploaded files", so the files of a completed journey can still be seen.

## [1.5.2] - 2026-11-05

### Changed
- Checking in late or checking out early now needs a reason, and it always goes to your Team Lead. If the Team Lead rejects it, the day counts as a half day.
- Team Leads see how many late check-ins and early check-outs the person has had this month, against the number allowed.
- Rejected attendance days show as "Half day (rejected)".

### Added
- myHR Settings, Access pauses (SuperAdmin): Team Leads paused for approvals left waiting past Monday 09:00, with the late requests, and Restore access with a note.
- DealGuard, for PCs: while DealGuard is open, the app checks where the phone or computer is, at random moments 1 to 3 times an hour, only between 10:00 and 19:30 IST. Audit Core works out how far that is from the nearest outlet the PC is assigned to. Every check is recorded. My HR pages never check.
- DealGuard, for PCs: when a check finds the PC more than 500 m from their outlets, a friendly note says so — for example "You seem to be about 3.2 km from Utkal Mahindra – CDA. DealGuard is meant to be used at your outlet during working hours." with an OK button. Nothing is asked and work is not stopped. When the location is not clear (a computer's location is often kilometres off) or is not allowed, nothing is shown; the check is only recorded.
- DealGuard, for PCs: opening DealGuard after 9 pm shows "It's getting late" once an evening on that device, with "OK, continue". The PC can carry on working.
- DealGuard, "Location checks" (Team Lead, Project Manager, Executive; SuperAdmin under Reports): each PC's checks for a day — how many, how many away, the last one with its time and distance, and the full list when the PC is opened. "Only away" shows just the checks that found a PC away.

## [1.5.1] - 2026-11-05

### Changed
- The app tells Security its version when it checks for notices, so an older app can be told to update while this one carries on.
- Update required: "Download the latest app" opens the download page in the phone's browser, where the person signs in and installs the new version.

## [1.5.0] - 2026-11-04

### Changed
- Profile: only HR can change a person's photo (it is the face attendance photos are compared with). The "Change photo" button is gone from My Profile; HR changes it on the employee's page.

### Added
- Attendance: when the photo does not look like the person's profile picture, a friendly note says so after check-in or check-out ("You don't look quite like your profile picture…"). The attendance is still recorded; HR still sees the flag.
- My leave: paid leave is earned from attendance — 1 day for every 22 days of attendance, up to 3 days held (both set by HR). There is no Sick or Earned leave any more. The page shows how many days of attendance count so far, when the count is paused, and what each completed block earned or lost at the cap.
- My leave: Special occasion leave (with its own yearly quota; say what the occasion is) and Comp-off (earned by approved work on a Sunday or holiday).
- My leave: days in the last 30 with no attendance and no leave are listed, with a button to apply leave for each.
- Approvals, leave: the Team Lead sees the balance available, the occasion, and a warning when approving would leave an outlet with no PC on some dates.
- The app checks whether its version is still allowed. When SuperAdmin has set a minimum version and this app is older, it shows "Update required" with a link to download the latest app, and sign-in is refused.
- SuperAdmin, Reports, App tab: "Oldest app version allowed" — set the minimum version and, if wanted, when it starts, and see how many people are still below it.
- My HR, "Team Lead Approvals" (Executive, HR, CEO): what is waiting with each Team Lead and Project Manager — attendance, leave and claims — the oldest, how many are past the Monday 09:00 deadline, and how quickly they decide.
- SuperAdmin, Reports: an "App" tab — who has the Verigence Android app and which version. Per person: whether they downloaded it, when, how many times, which version they took, and the version their app reports when it signs in, with a count of how many people are on each version and a CSV. Expanding a person shows every download with its date and version.
- Bookings & Deliveries, adding documents: a banner says which booking the documents go into — "Adding documents to booking ADI-… — customer being identified", with the customer's name once it is read — and has a "Start next booking" button. Right after the first file of a new booking: "Booking … created. Next customer? Start next booking". If files are still uploading, the next booking opens as soon as they are received.
- Bookings & Deliveries: a file whose name looks like a different customer from the booking (for example "Tapan kumar patra.pdf" on Azizur Rehaman's booking) is asked about before it is uploaded: "Start new booking with this file" or "Add to this booking". Files that name no one (IMG_…, scan001.pdf, invoice.pdf) go straight in.
- Bookings & Deliveries: when Audit Core finds an uploaded file is another person's, the booking says so ("… is X's file, not this customer's — it has been taken out of this booking") and links to the booking it was moved to.

### Fixed
- Bookings & Deliveries: after a booking was created on the new-booking screen, "Capture New Booking" (or a link to another booking) changed the address but kept the screen on the booking just created, so the next customer's files went into it. Every booking now opens on a fresh screen.

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
