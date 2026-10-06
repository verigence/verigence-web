export interface LandingInput {
  features: { status: 'loading' | 'ready' | 'error'; audit?: boolean };
  hr: { loading: boolean; /** An employee record or any HR permission. */ available: boolean; isEmployee: boolean; canReadEmployees: boolean };
  /** The landing URL's query string: any parameter means the person is doing Audit work. */
  searchParams: URLSearchParams;
}

/** Where a person with HR goes: an employee to attendance, an HR reader to the employee list, other HR holders to their own page. */
export function hrHomePath(hr: { isEmployee: boolean; canReadEmployees: boolean }): string {
  if (hr.isEmployee) return '/hr/attendance';
  return hr.canReadEmployees ? '/hr/employees' : '/hr/me';
}

export type LandingDecision = { kind: 'wait' } | { kind: 'go'; to: string } | { kind: 'stay' };

/**
 * Where the plain landing page sends a person. Someone without the Audit switch who has HR goes to HR,
 * not to the old overview. Anything unknown or failed stays on the existing page: nobody is locked out.
 */
export function landingDecision({ features, hr, searchParams }: LandingInput): LandingDecision {
  if (Array.from(searchParams.keys()).length > 0) return { kind: 'stay' };
  if (features.status === 'loading') return { kind: 'wait' };
  if (features.status === 'error' || features.audit === true) return { kind: 'stay' };
  if (hr.loading) return { kind: 'wait' };
  if (!hr.available) return { kind: 'stay' };
  return { kind: 'go', to: hrHomePath(hr) };
}
