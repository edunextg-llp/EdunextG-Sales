export const selectedAssignments = (drafts, excludedIds) => drafts
  .map((draft) => ({ ...draft, rows: draft.rows.filter((row) => !excludedIds.includes(String(row.id))) }))
  .filter((draft) => draft.rows.length);

export const remainingAssignments = (drafts, movedIds, excludedIds) =>
  selectedAssignments(drafts, [...movedIds, ...excludedIds]);

export const toggleAssignmentSelection = (excludedIds, ids) =>
  ids.every((id) => !excludedIds.includes(id))
    ? [...new Set([...excludedIds, ...ids])]
    : excludedIds.filter((id) => !ids.includes(id));
