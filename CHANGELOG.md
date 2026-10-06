# Verigence app changelog

Every change that reaches the Android app is written here, in simple English, under **Unreleased**.
When a release is made, run `npm run release:version -- 0.2.0` (use the next number). It moves
everything under Unreleased to that version and sets the same version in `package.json`. Commit
both, then run **Publish Verigence Android App**. The release workflow refuses to publish a version
that has no notes here, shows these notes as the release note, and tags the commit in Git.

Version numbers: the first number for a big change, the second for new features, the third for fixes.
The app's build number is added by the release workflow and is not written here.

## [Unreleased]

### Added
- Employees page shows how many employees there are, how many are active, and how many have a Verigence login.
- "Sync with Verigence" on the Employees page creates the missing Verigence logins (five at a time) and links the ones that already exist.
- Employee status is now Active, Suspended, Terminated or Quit. HR asks for a change and the CEO approves it. The status changes only after approval, and a login is suspended when an employee is no longer active.
- Daily attendance has filters: checked in, checked out, checked in and out, in but not out yet, not checked in, on leave, delinquencies, needs approval.
- Housekeeping: SuperAdmin can delete an employee added only for testing. It is refused if a payroll or a paid reimbursement used the person.
- The app now tells the server which version it is, so the login report and the device diagnostics show it.
- Face match: HR sees "Face does not match" when the face in a check-in or check-out photo is not the employee's. It is compared with the profile photo; if there is none, the check-out is compared with the check-in photo of the same day. It is only a flag, never a refusal. HR also sees the match score (1 is identical) next to each check-in and check-out time; nothing acts on it.
- On the profile page you can take a selfie for your profile photo. The Attendance page reminds you to add your photo if you have not.

### Changed
- Changing an employee's e-mail or mobile number in HR also changes it on their Verigence login. The login, the roles and the password stay the same.
- A new login made by HR for an employee is ready to use. It no longer waits for SuperAdmin approval.
- The status can no longer be edited in the Edit form.

## [0.1.0] - baseline

The Android app as it was when version tracking started. Earlier changes are in the Git history.
