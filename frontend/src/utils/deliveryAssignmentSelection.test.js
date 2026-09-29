import { selectedAssignments, remainingAssignments, toggleAssignmentSelection } from "./deliveryAssignmentSelection";

const drafts = [
  { id: "a", boy: "10", date: "2026-09-29", rows: [{ id: 1 }, { id: 2 }] },
  { id: "b", boy: "11", date: "2026-09-30", rows: [{ id: 3 }] },
];

test("bills start selected; exclusions affect submission and PDF without changing drafts", () => {
  expect(selectedAssignments(drafts, [])).toEqual(drafts);
  expect(selectedAssignments(drafts, ["2", "3"])).toEqual([{ ...drafts[0], rows: [{ id: 1 }] }]);
  expect(drafts[0].rows).toHaveLength(2);
  expect(selectedAssignments(drafts, ["1", "2", "3"])).toEqual([]);
});

test("individual selection and mixed area selection can be restored", () => {
  expect(toggleAssignmentSelection([], ["1"])).toEqual(["1"]);
  expect(toggleAssignmentSelection(["1"], ["1"])).toEqual([]);
  expect(toggleAssignmentSelection(["1", "3"], ["1", "2"])).toEqual(["3"]);
  expect(toggleAssignmentSelection(["3"], ["1", "2"])).toEqual(["3", "1", "2"]);
});

test("partial success retains failed assignments and releases unselected bills", () => {
  expect(remainingAssignments(drafts, ["1"], ["3"])).toEqual([{ ...drafts[0], rows: [{ id: 2 }] }]);
  expect(remainingAssignments(drafts, ["1", "2"], ["3"])).toEqual([]);
});
