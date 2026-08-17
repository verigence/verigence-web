import { z } from 'zod';

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.'),
  workEmail: z.string().trim().email('Enter a valid work email address.'),
  verigenceKey: z
    .string()
    .trim()
    .min(4, 'Enter the Verigence Key provided to you.')
    .max(100, 'Verigence Key is too long.'),
  mobileNumber: z
    .string()
    .trim()
    .max(24, 'Mobile number is too long.')
    .refine(
      (value) => !value || /^[+0-9 ()-]{7,24}$/.test(value),
      'Enter a valid mobile number.',
    )
    .optional(),
});

export type SignupFormValues = z.infer<typeof signupSchema>;
