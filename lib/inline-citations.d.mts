export type InlineCitationTextSegment = {
  type: "text";
  text: string;
};

export type InlineCitationSourceSegment = {
  type: "citation";
  label: string;
  title: string | null;
  url: string;
};

export type InlineCitationSegment =
  | InlineCitationTextSegment
  | InlineCitationSourceSegment;

export function parseInlineCitations(text: string): InlineCitationSegment[];
export function getUniqueCitationSources(
  segments: readonly InlineCitationSegment[],
): InlineCitationSourceSegment[];
