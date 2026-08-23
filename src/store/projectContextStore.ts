import { create } from 'zustand';

import type { OperationalProject } from '../services/audit-core/uc03';

interface ProjectContextState {
  projects: OperationalProject[];
  selectedProject?: OperationalProject;
  setProjects: (projects: OperationalProject[]) => void;
  selectProject: (project: OperationalProject) => void;
  clearSelection: () => void;
  reset: () => void;
}

export const useProjectContextStore = create<ProjectContextState>((set) => ({
  projects: [],
  selectedProject: undefined,
  setProjects: (projects) =>
    set((state) => {
      const selectedProject = state.selectedProject
        ? projects.find((project) => project.tenantId === state.selectedProject?.tenantId)
        : undefined;
      return { projects, selectedProject };
    }),
  selectProject: (selectedProject) => set({ selectedProject }),
  clearSelection: () => set({ selectedProject: undefined }),
  reset: () => set({ projects: [], selectedProject: undefined }),
}));
