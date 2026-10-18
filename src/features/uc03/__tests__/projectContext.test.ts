import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  restoreOperationalContextHint,
  selectOperationalOutlet,
  selectOperationalProject,
} from '../projectContext';
import { useProjectContextStore } from '../../../store/projectContextStore';
import { useSessionStore } from '../../../store/sessionStore';
import type { OperationalProject } from '../../../services/audit-core/uc03';

/** A token whose `sub` is what the workspace hint is keyed by. */
function tokenFor(subject: string): string {
  const payload = globalThis.btoa(JSON.stringify({ sub: subject }));
  return `header.${payload}.signature`;
}

function project(over: Partial<OperationalProject> = {}): OperationalProject {
  return {
    tenantId: 'tenant-a',
    projectCode: 'MAH-A',
    projectName: 'Mahindra A',
    projectStatus: 'ACTIVE',
    timezoneName: 'Asia/Kolkata',
    operatingRole: 'PC',
    scope: {
      allDealers: false,
      dealerCount: 1,
      outletCount: 1,
      outlets: [
        { dealerId: 'dealer-1', dealerName: 'Dealer One', outletId: 'outlet-1', outletName: 'Outlet One', outletClassification: 'ONSITE' },
      ],
    },
    ...over,
  } as OperationalProject;
}

/** Just enough QueryClient to record what the restore path does. */
function queryClientStub() {
  return {
    invalidated: [] as unknown[],
    setQueryData: vi.fn(),
    cancelQueries: vi.fn(),
    removeQueries: vi.fn(),
    invalidateQueries: vi.fn(function (this: void, options: { queryKey?: unknown }) {
      stub.invalidated.push(options.queryKey);
    }),
  };
}
let stub: ReturnType<typeof queryClientStub>;

/** The scheduled revalidation runs behind a 100 ms primary-queue wait. */
const settle = () => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 250));

describe('the restored workspace hint is always revalidated', () => {
  beforeEach(() => {
    // These tests run in the node environment, which has no localStorage. The
    // hint is a localStorage optimisation, so it gets the smallest real one.
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
        clear: () => store.clear(),
      },
    });
    useProjectContextStore.getState().reset();
    useSessionStore.setState({ accessToken: tokenFor('user-1') } as never);
    stub = queryClientStub();
  });

  function seedHint(outletId = 'outlet-1') {
    globalThis.localStorage.setItem(
      `verigence.uc03.workspace.v1:user-1`,
      JSON.stringify({ project: project(), outletId }),
    );
  }

  it('restores a single project so the first screen can render at once', () => {
    seedHint();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(restoreOperationalContextHint(tokenFor('user-1'), stub as any)).toBe(true);
    expect(useProjectContextStore.getState().projects).toHaveLength(1);
    expect(useProjectContextStore.getState().selectedProject?.tenantId).toBe('tenant-a');
  });

  it('still revalidates after the gate auto-selects a one-outlet PC', async () => {
    // The regression: selectOperationalOutlet used to cancel the pending
    // revalidation, and the gate calls it immediately for a PC with one
    // outlet. The project list then stayed as the hint's single entry for the
    // whole session -- the query never refetches -- so a second project was
    // invisible and the nav gated on a stale operating role.
    seedHint();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    restoreOperationalContextHint(tokenFor('user-1'), stub as any);

    const restored = project();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selectOperationalOutlet(restored, restored.scope.outlets[0], stub as any);

    await settle();
    expect(stub.invalidated).toContainEqual(['uc03-projects']);
  });

  it('moves the selected project when the outlet sits under a different one', () => {
    // An outlet-scoped person can hold outlets in two dealerships, and the shell
    // offers all of them in one list. Picking one from the other project has to
    // carry the project with it, or the session keeps the previous project's
    // operating role and scope while reading the new tenant's data.
    seedHint();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    restoreOperationalContextHint(tokenFor('user-1'), stub as any);
    expect(useProjectContextStore.getState().selectedProject?.tenantId).toBe('tenant-a');

    const other = project({
      tenantId: 'tenant-b',
      projectCode: 'MAH-B',
      operatingRole: 'PC',
      scope: {
        allDealers: false,
        dealerCount: 1,
        outletCount: 1,
        outlets: [
          { dealerId: 'dealer-2', dealerName: 'Dealer Two', outletId: 'outlet-2', outletName: 'Outlet Two', outletClassification: 'ONSITE' },
        ],
      },
    } as Partial<OperationalProject>);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selectOperationalOutlet(other, other.scope.outlets[0], stub as any);

    expect(useProjectContextStore.getState().selectedProject?.tenantId).toBe('tenant-b');
    expect(useSessionStore.getState().tenantId).toBe('tenant-b');
    expect(useSessionStore.getState().outletId).toBe('outlet-2');
  });

  it('leaves the selected project alone when switching within it', () => {
    seedHint();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    restoreOperationalContextHint(tokenFor('user-1'), stub as any);
    const before = useProjectContextStore.getState().selectedProject;

    const same = project();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selectOperationalOutlet(same, same.scope.outlets[0], stub as any);

    // Same object, so the shell does not re-render for nothing.
    expect(useProjectContextStore.getState().selectedProject).toBe(before);
  });

  it('still revalidates after a project is chosen from the list', async () => {
    seedHint();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    restoreOperationalContextHint(tokenFor('user-1'), stub as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selectOperationalProject(project(), stub as any);

    await settle();
    expect(stub.invalidated).toContainEqual(['uc03-projects']);
  });
});
