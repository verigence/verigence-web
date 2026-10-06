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
- Price masters: Process Coordinators, Team Leads and Project Managers can look up price sheets. Team Leads and Project Managers can upload price lists, many files at once, using the template that can be downloaded on the upload screen.

### Changed
- On "My employee profile" you can now also change your gender. Your name (as on Aadhaar or PAN), role, designation, department, date of joining, date of birth, experience, PAN and Aadhaar stay with HR. If your name is spelt wrongly, ask HR to correct it.
- To change your email or mobile you send a request to HR from "My employee profile". HR sees the old and the new value and approves or rejects it. Nothing changes until HR approves. Employees page shows the waiting requests to HR.
- Changing an employee's e-mail or mobile number in HR also changes it on their Verigence login. The login, the roles and the password stay the same.
- A new login made by HR for an employee is ready to use. It no longer waits for SuperAdmin approval.
- The status can no longer be edited in the Edit form.

## [1.0.0] - 2026-10-05

The first release of the Android app, published on 05 October 2026. Earlier changes are in the Git history.
