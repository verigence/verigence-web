import { z } from 'zod';

export const ONBOARDING_KEY_PREFIX = 'VGN';
export const ONBOARDING_KEY_DIGITS = 8;
export const ONBOARDING_KEY_PATTERN = /^VGN[0-9]{8}$/i;

export const signupSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name.').max(120, 'First name is too long.'),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(120, 'Last name is too long.'),
  email: z.string().trim().email('Enter a valid work email address.'),
  mobile: z
    .string()
    .trim()
    .regex(/^[6-9][0-9]{9}$/, 'Enter a valid 10-digit Indian mobile number.'),
  password: z.string().min(1, 'Enter a password.'),
  verigenceIdentifier: z
    .string()
    .trim()
    .regex(
      ONBOARDING_KEY_PATTERN,
      `Enter a valid Verigence onboarding key (${ONBOARDING_KEY_PREFIX} followed by ${ONBOARDING_KEY_DIGITS} digits).`,
    ),
});

export type SignupFormValues = z.infer<typeof signupSchema>;
