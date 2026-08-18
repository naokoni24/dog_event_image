export type EventId =
  | "christmas"
  | "birthday"
  | "halloween"
  | "mothersday"
  | "valentine"
  | "newyear"
  | "tsuyu"
  | "natsumaturi"
  | "resort"
  | "momiji"
  | "otsukimi"
  | "undokai";

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
