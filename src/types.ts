export type EventId =
  | "christmas"
  | "birthday"
  | "halloween"
  | "mothersday"
  | "valentine"
  | "newyear"
  | "tsuyu"
  | "natsumaturi"
  | "resort";

export interface EventConfig {
  id: EventId;
  label: string;
  emoji: string;
  color: string;
  prompts: string[];
}

export interface GeneratedImage {
  data: string;
  index: number;
  status: "loading" | "done" | "error";
  error?: string;
}
