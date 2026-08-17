import { z } from 'zod';

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.'),
  workEmail: z.string().trim().email('Enter a valid work email address.'),
  tenantCode: z
    .string()
    .trim()
    .min(2, 'Enter the organization / Tenant code provided by your administrator.')
    .max(80, 'Tenant code is too long.'),
  employeeId: z.string().trim().max(80, 'Employee ID is too long.').optional(),
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
