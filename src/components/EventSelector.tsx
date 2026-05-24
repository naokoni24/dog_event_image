import type { EventConfig, EventId } from "../types";

interface Props {
  events: EventConfig[];
  selected: EventId | null;
  onSelect: (id: EventId) => void;
  disabled: boolean;
}

export function EventSelector({ events, selected, onSelect, disabled }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {events.map((event) => (
        <button
          key={event.id}
          onClick={() => onSelect(event.id)}
          disabled={disabled}
          className={`
            flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all
            ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:scale-105 active:scale-95"}
            ${selected === event.id
              ? "border-current shadow-lg scale-105"
              : "border-amber-200 bg-white hover:border-amber-300"
            }
          `}
          style={
            selected === event.id
              ? { borderColor: event.color, backgroundColor: event.color + "18" }
              : {}
          }
        >
          <span className="text-3xl">{event.emoji}</span>
          <span className="text-xs font-medium text-amber-900">{event.label}</span>
        </button>
      ))}
    </div>
  );
}
