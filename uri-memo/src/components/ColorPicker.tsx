import { NOTE_COLORS, type NoteColor } from "../domain/note";
import { useT } from "../i18n";

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
  const t = useT();
  return (
    <div className="color-picker" role="radiogroup" aria-label={t("메모 색상")}>
      {NOTE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={t(COLOR_LABELS[color])}
          title={t(COLOR_LABELS[color])}
          className={`color-swatch color-${color}`}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
