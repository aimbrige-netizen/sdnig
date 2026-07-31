'use client';

// 공통 필드 폼 (기획서 5절)
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CATEGORIES } from '@/lib/constants';
import { SIDO_LIST, gugunsOf } from '@/lib/regions';
import { AddressSearchButton } from './address-search';
import { EMPTY_OPTION, emptyProduct, type ProductRow, type VendorFormState } from './form-state';
import { NativeSelect } from './native-select';
import { ProductPhotosField } from './photo-uploader';
import { TagInput } from './tag-input';
import { TimeRangeSelect } from './time-select';

interface CommonFieldsFormProps {
  state: VendorFormState;
  patch: (partial: Partial<VendorFormState> | ((prev: VendorFormState) => Partial<VendorFormState>)) => void;
  isEdit: boolean;
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function CommonFieldsForm({ state, patch, isEdit }: CommonFieldsFormProps) {
  const guguns = gugunsOf(state.regionSido);

  return (
    <div className="space-y-5">
      <Field label="업체명" required>
        <Input value={state.name} onChange={(e) => patch({ name: e.target.value })} placeholder="업체명" />
      </Field>

      <Field label="작성자" required hint="이 업체 정보를 기입하는 담당 직원명입니다.">
        <Input
          value={state.authorName}
          onChange={(e) => patch({ authorName: e.target.value })}
          placeholder="예: 홍길동"
          className="w-56"
        />
      </Field>

      <Field
        label="카테고리"
        required
        hint={isEdit ? '카테고리를 바꾸면 업종별 정보 탭의 입력 항목이 바뀝니다.' : undefined}
      >
        <NativeSelect
          value={state.category}
          onChange={(e) => patch({ category: e.target.value as VendorFormState['category'] })}
          placeholder="카테고리 선택"
          options={CATEGORIES.map((c) => ({ value: c.code, label: c.label }))}
          className="w-56"
        />
      </Field>

      <Field label="업체연락처" required>
        <Input
          type="tel"
          value={state.contact}
          onChange={(e) => patch({ contact: e.target.value })}
          placeholder="예: 02-1234-5678"
          className="w-64"
        />
      </Field>

      <Field label="운영시간" required>
        <TimeRangeSelect
          start={state.businessHoursStart}
          end={state.businessHoursEnd}
          onChange={(start, end) => patch({ businessHoursStart: start, businessHoursEnd: end })}
        />
      </Field>

      <Field label="지역" required hint="리스트 필터/검색용 지역입니다.">
        <div className="flex items-center gap-2">
          <NativeSelect
            value={state.regionSido}
            onChange={(e) => patch({ regionSido: e.target.value, regionGugun: '' })}
            placeholder="시/도"
            options={SIDO_LIST.map((s) => ({ value: s, label: s }))}
            className="w-44"
          />
          <NativeSelect
            value={state.regionGugun}
            onChange={(e) => patch({ regionGugun: e.target.value })}
            placeholder={guguns.length === 0 ? '해당 없음' : '구/군'}
            options={guguns.map((g) => ({ value: g, label: g }))}
            disabled={!state.regionSido || guguns.length === 0}
            className="w-40"
          />
        </div>
      </Field>

      <Field label="주소" required>
        <div className="flex items-center gap-2">
          <Input
            value={state.address}
            onChange={(e) => patch({ address: e.target.value })}
            placeholder="주소 검색 버튼을 누르거나 직접 입력"
            className="flex-1"
          />
          <AddressSearchButton
            onSelect={({ address, sido, sigungu }) => {
              const nextPatch: Partial<VendorFormState> = { address };
              // 검색 결과로 지역 셀렉트 자동 채움 (매칭될 때만)
              if (SIDO_LIST.includes(sido)) {
                nextPatch.regionSido = sido;
                const gugunList = gugunsOf(sido);
                const matched = gugunList.find((g) => sigungu === g || sigungu.startsWith(g));
                nextPatch.regionGugun = matched ?? '';
              }
              patch(nextPatch);
            }}
          />
        </div>
      </Field>

      <Field
        label="상품구성"
        required
        hint="상품명 + 가격 + 설명을 +/− 버튼으로 여러 개 등록할 수 있습니다. 가격과 사진은 선택사항이며, 사진은 상품마다 여러 장 추가할 수 있습니다. (상품명은 각 상품마다 필수입니다)"
      >
        <div className="space-y-2">
          {state.products.map((product, i) => {
            // id 기준으로 갱신 — 사진 업로드처럼 시간이 걸리는 작업이 끝났을 때는 그 사이
            // 다른 행이 추가/삭제됐을 수 있으므로, 배열 인덱스가 아니라 최신 state(prev)에서
            // 같은 id를 다시 찾아 갱신해야 엉뚱한 행을 덮어쓰지 않는다.
            const updateProduct = (changes: Partial<ProductRow>) =>
              patch((prev) => ({
                products: prev.products.map((p) => (p.id === product.id ? { ...p, ...changes } : p)),
              }));
            // 사진은 배열 자체를 통째로 교체하지 않고, 적용 시점의 최신 photos(prev)에
            // updater를 적용 — 업로드 진행 중 다른 사진을 지워도 되살아나지 않는다.
            const updateProductPhotos = (updater: (prev: string[]) => string[]) =>
              patch((prev) => ({
                products: prev.products.map((p) =>
                  p.id === product.id ? { ...p, photos: updater(p.photos) } : p
                ),
              }));
            return (
              <div key={product.id} className="space-y-2 rounded-md border bg-neutral-50/50 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={product.name}
                    onChange={(e) => updateProduct({ name: e.target.value })}
                    placeholder="상품명"
                    className="w-56"
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={product.price}
                      onChange={(e) => updateProduct({ price: e.target.value })}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      placeholder="가격 (선택)"
                      aria-label={`${i + 1}번째 상품 가격`}
                      className="w-32"
                    />
                    <span className="text-xs text-muted-foreground">원</span>
                  </div>
                  <Input
                    value={product.description}
                    onChange={(e) => updateProduct({ description: e.target.value })}
                    placeholder="설명"
                    className="min-w-40 flex-1"
                  />
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        patch((prev) => ({ products: prev.products.filter((p) => p.id !== product.id) }))
                      }
                      disabled={state.products.length === 1}
                      title="삭제"
                    >
                      −
                    </Button>
                    {i === state.products.length - 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => patch((prev) => ({ products: [...prev.products, emptyProduct()] }))}
                        title="상품 추가"
                      >
                        ＋
                      </Button>
                    )}
                  </div>
                </div>
                <ProductPhotosField photos={product.photos} onUpdate={updateProductPhotos} />
              </div>
            );
          })}
        </div>
      </Field>

      <Field label="스타일/무드" hint="자유 입력 해시태그입니다. 엔터로 추가, 칩 클릭으로 삭제됩니다.">
        <TagInput value={state.styleMoods} onChange={(styleMoods) => patch({ styleMoods })} />
      </Field>

      <Field label="추가옵션" hint="옵션명 + 가격(+설명)을 여러 개 등록할 수 있습니다.">
        <div className="space-y-2">
          {state.options.map((option, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border bg-neutral-50/50 p-2">
              <Input
                value={option.name}
                onChange={(e) => {
                  const next = [...state.options];
                  next[i] = { ...next[i], name: e.target.value };
                  patch({ options: next });
                }}
                placeholder="옵션명"
                className="w-48"
              />
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={option.price}
                  onChange={(e) => {
                    const next = [...state.options];
                    next[i] = { ...next[i], price: e.target.value };
                    patch({ options: next });
                  }}
                  placeholder="가격"
                  className="w-32"
                />
                <span className="text-xs text-muted-foreground">원</span>
              </div>
              <Input
                value={option.desc}
                onChange={(e) => {
                  const next = [...state.options];
                  next[i] = { ...next[i], desc: e.target.value };
                  patch({ options: next });
                }}
                placeholder="설명 (선택)"
                className="min-w-32 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => patch({ options: state.options.filter((_, idx) => idx !== i) })}
                title="삭제"
              >
                −
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => patch({ options: [...state.options, { ...EMPTY_OPTION }] })}
          >
            ＋ 옵션 추가
          </Button>
        </div>
      </Field>

      <Field label="업체설명" required>
        <Textarea
          value={state.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="업체 상세 설명"
          rows={6}
        />
      </Field>

      <Field label="스딩 전용 혜택">
        <Textarea
          value={state.sdingBenefit}
          onChange={(e) => patch({ sdingBenefit: e.target.value })}
          placeholder="스딩 회원 전용 혜택 (선택)"
          rows={3}
        />
      </Field>
    </div>
  );
}
