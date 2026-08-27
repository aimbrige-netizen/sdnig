'use client';

// 업체 등록/수정 폼 (기획서 10절 — [공통정보] [업종별 정보] [사진관리] 3개 탭 + 저장 버튼)
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { categoryLabel, MAX_UPLOAD_BYTES, type CategoryCode } from '@/lib/constants';
import { vendorPayloadSchema } from '@/lib/vendor-schema';
import { CategoryFieldsForm } from './category-fields-form';
import { CommonFieldsForm } from './common-fields-form';
import {
  emptyCategoryData,
  formStateFromPrefill,
  formStateFromVendor,
  initialFormState,
  serializeForm,
  type VendorDTO,
  type VendorFormState,
  type VendorPrefill,
} from './form-state';
import {
  MainPhotoField,
  PhotoListField,
  UploadBusyContext,
  VideoListField,
  useWarnBeforeUnload,
} from './photo-uploader';
import { VideoLinkField } from './video-link-field';
import { DownloadAllPhotos } from './download-all-photos';
import { BrandLoaderOverlay } from '@/components/brand-loader';
import { deleteContract } from '@/app/contracts/actions';

// zod 이슈 경로 → 한글 필드명 (에러 요약 표시용)
const FIELD_LABELS: Record<string, string> = {
  name: '업체명',
  authorName: '작성자',
  category: '카테고리',
  contact: '업체연락처',
  businessHoursStart: '운영시간(시작)',
  businessHoursEnd: '운영시간(종료)',
  region: '지역',
  address: '주소',
  products: '상품구성',
  description: '업체설명',
  photos: '대표사진',
  categoryData: '업종별 정보',
};

const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);

type TabKey = 'common' | 'category' | 'photos';

// zod 이슈 경로(최상위 키) → 그 필드가 위치한 탭. 탭에 없는 필드가 있으면 안내 문구가 가리키는
// 입력창이 실제로는 언마운트돼 있어 보이지 않는 문제가 있어(특히 이번에 필수가 된 작성자처럼
// 기존 업체는 값이 비어 있던 필드), 검증 실패 시 해당 탭으로 자동 전환한다.
const FIELD_TAB: Record<string, TabKey> = {
  name: 'common',
  authorName: 'common',
  category: 'common',
  contact: 'common',
  businessHoursStart: 'common',
  businessHoursEnd: 'common',
  region: 'common',
  address: 'common',
  products: 'common',
  styleMoods: 'common',
  options: 'common',
  description: 'common',
  sdingBenefit: 'common',
  categoryData: 'category',
  photos: 'photos',
};

interface VendorFormProps {
  vendor?: VendorDTO; // 있으면 수정 모드
  /** 계약 업체 DB에서 넘어온 미리 채움 값 (등록 모드) */
  prefill?: VendorPrefill;
  /** 이 업체를 저장하면 삭제할 계약 DB 항목 id */
  fromContractId?: number;
}

export function VendorForm({ vendor, prefill, fromContractId }: VendorFormProps) {
  const router = useRouter();
  const isEdit = !!vendor;
  const [state, setState] = useState<VendorFormState>(() =>
    vendor ? formStateFromVendor(vendor) : prefill ? formStateFromPrefill(prefill) : initialFormState()
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 업로드가 하나라도 진행 중이면 저장을 막는다. 아직 URL 이 없는 사진·영상은 저장 내용에서
  // 빠지는데, 파일은 이미 저장소에 올라가 있어 "올렸는데 사라졌다" 가 되기 때문이다.
  const [uploadCount, setUploadCount] = useState(0);
  const bumpUpload = useCallback((delta: number) => {
    setUploadCount((c) => Math.max(0, c + delta));
  }, []);
  const uploading = uploadCount > 0;
  useWarnBeforeUnload(uploading);
  const [activeTab, setActiveTab] = useState<TabKey>('common');

  // 함수 형태도 허용 — 비동기 작업(사진 업로드 등)이 끝난 시점의 최신 state를 기준으로
  // 갱신해야 그 사이에 있었던 다른 변경(행 추가/삭제, 다른 필드 입력)을 덮어쓰지 않는다.
  const patch = (partial: Partial<VendorFormState> | ((prev: VendorFormState) => Partial<VendorFormState>)) =>
    setState((prev) => ({ ...prev, ...(typeof partial === 'function' ? partial(prev) : partial) }));

  const category = state.category as CategoryCode | '';
  const categoryData = useMemo(() => {
    if (!category) return null;
    return state.categoryDataByCategory[category] ?? emptyCategoryData(category);
  }, [category, state.categoryDataByCategory]);

  async function handleSave() {
    setErrors([]);
    const payload = serializeForm(state);
    const parsed = vendorPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => {
        const root = String(issue.path[0] ?? '');
        const label = FIELD_LABELS[root] ?? root;
        return `${label}: ${issue.message}`;
      });
      setErrors([...new Set(messages)]);
      // 첫 오류가 속한 탭으로 전환 — 안 그러면 입력창이 비활성 탭에 언마운트돼 있어 안 보인다.
      const firstRoot = String(parsed.error.issues[0]?.path[0] ?? '');
      setActiveTab(FIELD_TAB[firstRoot] ?? 'common');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(isEdit ? `/api/vendors/${vendor!.id}` : '/api/vendors', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrors([data?.error ?? `저장에 실패했습니다. (HTTP ${res.status})`]);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      // 계약 업체 DB에서 넘어온 건이면, 업체 정보가 완성됐으므로 그 항목을 지운다.
      // 삭제가 실패해도 업체 저장은 이미 끝났으므로 흐름을 막지 않는다.
      if (fromContractId) {
        await deleteContract(fromContractId).catch(() => null);
      }
      router.push('/vendors');
      router.refresh();
    } catch {
      setErrors(['네트워크 오류로 저장하지 못했습니다. 다시 시도해주세요.']);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!vendor) return;
    if (!window.confirm(`'${vendor.name}' 업체를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrors([data?.error ?? '삭제에 실패했습니다.']);
        return;
      }
      router.push('/vendors');
      router.refresh();
    } catch {
      setErrors(['네트워크 오류로 삭제하지 못했습니다.']);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <UploadBusyContext.Provider value={bumpUpload}>
    <div className="space-y-4">
      {(saving || deleting) && <BrandLoaderOverlay label={deleting ? '삭제 중' : '저장 중'} />}

      {prefill && !isEdit && (
        <div className="card-surface animate-fade-up p-4">
          <p className="text-sm font-medium">계약 업체 DB에서 가져왔습니다</p>
          <p className="mt-1 text-xs text-muted-foreground">
            업체명·연락처·주소·작성자를 미리 채웠습니다. 저장하면 계약 업체 DB에서 이 항목은 삭제됩니다.
          </p>
          {prefill.memo.trim() && (
            <p className="mt-2 rounded-md bg-neutral-50 p-2 text-xs whitespace-pre-wrap text-muted-foreground">
              <span className="font-medium text-foreground">메모</span> · {prefill.memo}
            </p>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-red-50 p-3 text-sm text-destructive">
          <p className="mb-1 font-medium">저장할 수 없습니다. 아래 항목을 확인해주세요.</p>
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="common">공통정보</TabsTrigger>
          <TabsTrigger value="category">
            업종별 정보{category ? ` (${categoryLabel(category)})` : ''}
          </TabsTrigger>
          <TabsTrigger value="photos">{category === 'video' ? '사진·영상' : '사진관리'}</TabsTrigger>
        </TabsList>

        <TabsContent value="common" className="card-surface p-4 sm:p-6">
          <CommonFieldsForm state={state} patch={patch} isEdit={isEdit} />
        </TabsContent>

        <TabsContent value="category" className="card-surface p-4 sm:p-6">
          {category && categoryData ? (
            <CategoryFieldsForm
              category={category}
              value={categoryData}
              onChange={(next) =>
                patch({
                  categoryDataByCategory: { ...state.categoryDataByCategory, [category]: next },
                })
              }
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              먼저 [공통정보] 탭에서 카테고리를 선택해주세요.
            </p>
          )}
        </TabsContent>

        <TabsContent value="photos" className="card-surface space-y-6 p-4 sm:p-6">
          <DownloadAllPhotos state={state} />

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              대표사진 <span className="text-destructive">*</span>
            </Label>
            <MainPhotoField
              value={state.mainPhoto}
              onChange={(mainPhoto) => patch({ mainPhoto })}
              downloadName={`${state.name.trim() || '업체'}-대표사진`}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">갤러리 사진</Label>
            <p className="text-xs text-muted-foreground">여러 장을 한 번에 올릴 수 있습니다. ↑↓ 버튼으로 순서를 바꿉니다.</p>
            <PhotoListField
              photos={state.galleryPhotos}
              onUpdate={(updater) => setState((prev) => ({ ...prev, galleryPhotos: updater(prev.galleryPhotos) }))}
              downloadPrefix={`${state.name.trim() || '업체'}-갤러리`}
            />
          </div>

          {category === 'dress' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">드레스 사진</Label>
              <p className="text-xs text-muted-foreground">
                드레스마다 이름/라인 라벨을 입력해주세요. (예: 화이트 A라인)
              </p>
              <PhotoListField
                photos={state.dressPhotos}
                onUpdate={(updater) => setState((prev) => ({ ...prev, dressPhotos: updater(prev.dressPhotos) }))}
                withLabel
                labelPlaceholder="드레스명 / 라인 (예: 머메이드 라인)"
                downloadPrefix={`${state.name.trim() || '업체'}-드레스`}
              />
            </div>
          )}

          {/* 업종을 바꾸면 그 업종 전용 사진·영상은 화면에서 사라지지만 데이터는 보존된다.
              보이지 않으면 지울 수도 없어 저장 용량만 차지하므로, 남아 있다는 사실을 알린다. */}
          {category !== 'video' && state.videos.length + state.videoLinks.length > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              이 업체에는 이전에 등록한 샘플 영상 {state.videos.length + state.videoLinks.length}개가 남아
              있습니다. 업종을 [영상(DVD)] 으로 바꾸면 보이고, 거기서 지울 수 있습니다.
            </p>
          )}
          {category !== 'dress' && state.dressPhotos.length > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              이 업체에는 이전에 올린 드레스 사진 {state.dressPhotos.length}장이 남아 있습니다. 업종을
              [드레스] 로 바꾸면 보이고, 거기서 지울 수 있습니다.
            </p>
          )}

          {category === 'video' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">샘플 영상 링크</Label>
              <p className="text-xs text-muted-foreground">
                업체가 유튜브·비메오·네이버TV 에 올려둔 영상이 있으면 주소만 넣어주세요. 길이·용량
                제한이 없고 저장 공간도 쓰지 않아, 파일로 올리는 것보다 이 쪽이 낫습니다.
              </p>
              <VideoLinkField
                links={state.videoLinks}
                onUpdate={(updater) => setState((prev) => ({ ...prev, videoLinks: updater(prev.videoLinks) }))}
              />
            </div>
          )}

          {category === 'video' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">샘플 영상 파일</Label>
              <p className="text-xs text-muted-foreground">
                링크가 없을 때만 쓰세요. mp4 · mov · webm 을 올릴 수 있고 한 개당 최대
                {MAX_UPLOAD_MB}MB 입니다 — 휴대폰으로 찍은 원본은 대부분 이 한도를 넘습니다.
                용량이 넘으면 화질을 낮춰 내보내거나 길이를 잘라주세요. 아이폰 영상(.mov)은 저장은
                되지만 크롬에서 미리보기가 안 됩니다.
              </p>
              <VideoListField
                videos={state.videos}
                onUpdate={(updater) => setState((prev) => ({ ...prev, videos: updater(prev.videos) }))}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between">
        <div>
          {isEdit && (
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting || saving || uploading}>
              {deleting ? '삭제 중...' : '삭제'}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {uploading && (
            <span className="text-xs text-muted-foreground" role="status">
              업로드가 끝나야 저장할 수 있습니다
            </span>
          )}
          <Button type="button" variant="outline" onClick={() => router.push('/vendors')} disabled={saving}>
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || deleting || uploading}
            title={uploading ? '업로드가 끝난 뒤 저장할 수 있습니다' : undefined}
          >
            {saving ? '저장 중...' : uploading ? '업로드 중...' : '저장'}
          </Button>
        </div>
      </div>
    </div>
    </UploadBusyContext.Provider>
  );
}
