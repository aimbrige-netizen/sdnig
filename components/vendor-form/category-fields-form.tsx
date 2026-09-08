'use client';

// 업종별 전용 필드 동적 렌더링 (기획서 6절 — 선택한 카테고리에 따라 폼 구성 변경)
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CATEGORY_FIELDS, type CategoryField, type RepeatItemField } from '@/lib/category-fields';
import { categoryLabel, type CategoryCode } from '@/lib/constants';
import { emptyRepeatRow, type CategoryDataState, type RepeatRow } from './form-state';
import { NativeSelect } from './native-select';
import { TimeRangeSelect, TimeSelect } from './time-select';

interface CategoryFieldsFormProps {
  category: CategoryCode;
  value: CategoryDataState;
  onChange: (next: CategoryDataState) => void;
}

export function CategoryFieldsForm({ category, value, onChange }: CategoryFieldsFormProps) {
  const fields = CATEGORY_FIELDS[category];

  function patch(partial: CategoryDataState) {
    onChange({ ...value, ...partial });
  }

  // 여행사처럼 업종별로 따로 받을 항목이 없는 경우. 빈 탭만 덩그러니 두면
  // 아직 안 만든 화면인지 원래 없는 건지 구분이 안 된다.
  if (fields.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {categoryLabel(category)}는 업종별로 따로 받는 정보가 없습니다.
        <br />
        [공통정보] 와 [사진관리] 탭만 채우면 됩니다.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {fields.map((field) => (
        <FieldRenderer key={fieldKey(field)} field={field} state={value} patch={patch} />
      ))}
    </div>
  );
}

function fieldKey(field: CategoryField): string {
  switch (field.type) {
    case 'number_range':
      return field.keyMin;
    case 'time_range':
      return field.keyStart;
    case 'toggle_text':
      return field.keyBool;
    default:
      return field.key;
  }
}

function str(state: CategoryDataState, key: string): string {
  const v = state[key];
  return typeof v === 'string' ? v : '';
}

interface FieldRendererProps {
  field: CategoryField;
  state: CategoryDataState;
  patch: (partial: CategoryDataState) => void;
}

function FieldRenderer({ field, state, patch }: FieldRendererProps) {
  const set = (key: string, v: CategoryDataState[string]) => patch({ [key]: v });
  switch (field.type) {
    case 'text':
      return (
        <FieldWrap label={field.label}>
          <Input value={str(state, field.key)} onChange={(e) => set(field.key, e.target.value)} placeholder={field.placeholder} />
        </FieldWrap>
      );

    case 'textarea':
      return (
        <FieldWrap label={field.label}>
          <Textarea
            value={str(state, field.key)}
            onChange={(e) => set(field.key, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
          />
        </FieldWrap>
      );

    case 'number':
      return (
        <FieldWrap label={field.label}>
          <NumberWithUnit
            value={str(state, field.key)}
            onChange={(v) => set(field.key, v)}
            unit={field.unit}
            placeholder={field.placeholder}
          />
        </FieldWrap>
      );

    case 'number_range':
      return (
        <FieldWrap label={field.label}>
          <div className="flex items-center gap-2">
            <NumberWithUnit value={str(state, field.keyMin)} onChange={(v) => set(field.keyMin, v)} unit={field.unit} placeholder="최소" />
            <span className="text-sm text-muted-foreground">~</span>
            <NumberWithUnit value={str(state, field.keyMax)} onChange={(v) => set(field.keyMax, v)} unit={field.unit} placeholder="최대" />
          </div>
        </FieldWrap>
      );

    case 'multiselect': {
      const selected = Array.isArray(state[field.key]) ? (state[field.key] as string[]) : [];
      return (
        <FieldWrap label={field.label}>
          <MultiSelectChips
            options={field.options}
            allowCustom={field.allowCustom}
            selected={selected}
            onChange={(next) => set(field.key, next)}
          />
        </FieldWrap>
      );
    }

    case 'time_range':
      return (
        <FieldWrap label={field.label}>
          <TimeRangeSelect
            start={str(state, field.keyStart)}
            end={str(state, field.keyEnd)}
            onChange={(start, end) => patch({ [field.keyStart]: start, [field.keyEnd]: end })}
          />
        </FieldWrap>
      );

    case 'toggle_text': {
      const enabled = state[field.keyBool] === true;
      return (
        <FieldWrap label={field.label}>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={enabled} onCheckedChange={(checked) => set(field.keyBool, checked)} />
              {field.toggleLabel}
            </label>
            <Textarea
              value={str(state, field.keyText)}
              onChange={(e) => set(field.keyText, e.target.value)}
              placeholder="추가 안내 내용"
              rows={2}
            />
          </div>
        </FieldWrap>
      );
    }

    case 'repeat_list': {
      const rows = Array.isArray(state[field.key]) ? (state[field.key] as RepeatRow[]) : [];
      return (
        <FieldWrap label={field.label}>
          <RepeatListField field={field} rows={rows} onChange={(next) => set(field.key, next)} />
        </FieldWrap>
      );
    }
  }
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

function NumberWithUnit({
  value,
  onChange,
  unit,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-40"
      />
      {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
    </div>
  );
}

function MultiSelectChips({
  options,
  allowCustom,
  selected,
  onChange,
}: {
  options: string[];
  allowCustom?: boolean;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const allOptions = [...options, ...selected.filter((s) => !options.includes(s))];

  function toggle(option: string) {
    onChange(selected.includes(option) ? selected.filter((s) => s !== option) : [...selected, option]);
  }

  function addCustom() {
    const v = draft.trim();
    setDraft('');
    if (!v || selected.includes(v)) return;
    onChange([...selected, v]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {allOptions.map((option) => {
          const isOn = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                isOn
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {allowCustom && (
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="직접 입력 후 추가"
            className="w-48"
          />
          <Button type="button" variant="outline" size="sm" onClick={addCustom}>
            추가
          </Button>
        </div>
      )}
    </div>
  );
}

function RepeatItemInput({
  itemField,
  value,
  onChange,
}: {
  itemField: RepeatItemField;
  value: string;
  onChange: (v: string) => void;
}) {
  switch (itemField.type) {
    case 'number':
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={itemField.placeholder ?? itemField.label}
            className="w-32"
          />
          {itemField.unit && <span className="text-xs text-muted-foreground">{itemField.unit}</span>}
        </div>
      );
    case 'time':
      return <TimeSelect value={value} onChange={onChange} />;
    case 'select':
      return (
        <NativeSelect
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={itemField.label}
          options={(itemField.options ?? []).map((o) => ({ value: o, label: o }))}
        />
      );
    default:
      return (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={itemField.placeholder ?? itemField.label}
          className="min-w-32 flex-1"
        />
      );
  }
}

function RepeatListField({
  field,
  rows,
  onChange,
}: {
  field: Extract<CategoryField, { type: 'repeat_list' }>;
  rows: RepeatRow[];
  onChange: (rows: RepeatRow[]) => void;
}) {
  const safeRows = rows.length > 0 ? rows : [emptyRepeatRow(field)];

  function updateRow(index: number, key: string, v: string) {
    const next = safeRows.map((row, i) => (i === index ? { ...row, [key]: v } : row));
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {safeRows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border bg-neutral-50/50 p-2">
          {field.itemFields.map((itemField) => (
            <RepeatItemInput
              key={itemField.key}
              itemField={itemField}
              value={row[itemField.key] ?? ''}
              onChange={(v) => updateRow(i, itemField.key, v)}
            />
          ))}
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(safeRows.filter((_, idx) => idx !== i))}
              disabled={safeRows.length === 1}
              title="삭제"
            >
              −
            </Button>
            {i === safeRows.length - 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange([...safeRows, emptyRepeatRow(field)])}
                title={field.addLabel ?? '추가'}
              >
                ＋
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
