export type EventId =
  | "newyear"
  | "valentine"
  | "mothersday"
  | "tsuyu"
  | "natsumaturi"
  | "resort"
  | "otsukimi"
  | "undokai"
  | "imohori"
  | "halloween"
  | "momiji"
  | "christmas"
  | "birthday";

export interface EventConfig {
  id: EventId;
  label: string;
  emoji: string;
  color: string;
}

export interface GeneratedImage {
  data: string;
  index: number;
  status: "loading" | "done" | "error";
  completionOrder?: number;
  error?: string;
}
