import { matchesQuery } from './text';

export type SchoolStatus = 'pilot' | 'demo';

export interface School {
  id: string;
  name: string;
  subtitle: string;
  status: SchoolStatus;
}

/** Id of the always-visible "My university isn't listed" option. */
export const REQUEST_SCHOOL_ID = 'request';

/** Schools matching the query by name or subtitle, ignoring case and Vietnamese diacritics. */
export function filterSchools<T extends School>(schools: readonly T[], query: string): T[] {
  return schools.filter(school => school.id !== REQUEST_SCHOOL_ID && matchesQuery(query, school.name, school.subtitle, school.id));
}

/** Option ids in keyboard order: matching schools, then the request option which never filters out. */
export function schoolOptionIds(schools: readonly School[], query: string): string[] {
  return [...filterSchools(schools, query).map(school => school.id), REQUEST_SCHOOL_ID];
}
