import { auditCoreRequest } from './client';

export interface ProjectOemReference {
  oemId: string;
  oemCode: string;
  oemName: string;
}

export interface ProjectProductCategoryReference {
  productCategoryId: string;
  categoryCode: string;
  categoryName: string;
}

export interface ProjectReferenceData {
  oems: ProjectOemReference[];
  productCategories: ProjectProductCategoryReference[];
}

export function getProjectReferenceData(accessToken: string) {
  return auditCoreRequest<ProjectReferenceData>('/v1/project-reference-data', {
    accessToken,
  });
}
