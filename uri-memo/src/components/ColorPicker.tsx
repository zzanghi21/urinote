import { NOTE_COLORS, type NoteColor } from "../domain/note";

const COLOR_LABELS: Record<NoteColor, string> = {
  yellow: "노랑",
  green: "초록",
  pink: "분홍",
  purple: "보라",
  blue: "파랑",
  gray: "회색",
  charcoal: "차콜",
};

interface Props {
  value: NoteColor;
  onChange(color: NoteColor): void;
}

export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className="color-picker" role="radiogroup" aria-label="메모 색상">
      {NOTE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={COLOR_LABELS[color]}
          title={COLOR_LABELS[color]}
          className={`color-swatch color-${color}`}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
