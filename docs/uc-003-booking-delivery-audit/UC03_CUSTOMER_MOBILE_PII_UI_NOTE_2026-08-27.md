# UC03 Customer Mobile PII UI Note

No new Web endpoint or reveal flow is introduced. Web continues to call the normal Audit Core Customer APIs. Audit Core decides whether `mobileNumber` is masked or complete from the caller's resolved Security permissions. Existing UI consumers may continue to use `mobileLast4`; screens that display `mobileNumber` must render the API value as returned and must not attempt client-side unmasking or role-name authorization.
