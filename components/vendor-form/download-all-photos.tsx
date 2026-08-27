'use client';

// 업체의 원본 사진·영상을 한 번에 내려받기
//
// 저장된 파일명은 UUID 라 하나씩 받으면 나중에 어느 업체 것인지 알 수 없다.
// 여기서는 "업체명-대표사진", "업체명-갤러리 3" 처럼 이름을 붙여 순서대로 받는다.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { downloadAll } from '@/lib/download';
import { collectDownloads } from '@/lib/vendor-downloads';
import type { VendorFormState } from './form-state';

export function DownloadAllPhotos({ state }: { state: VendorFormState }) {
  const items = collectDownloads(state);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-neutral-50 px-3 py-2">
      <span className="text-xs text-muted-foreground">
        올린 원본 파일 {items.length}개를 그대로 내려받을 수 있습니다.
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={progress !== null}
        onClick={async () => {
          setProgress({ done: 0, total: items.length });
          try {
            await downloadAll(items, (done, total) => setProgress({ done, total }));
          } finally {
            setProgress(null);
          }
        }}
      >
        {progress ? `내려받는 중... ${progress.done}/${progress.total}` : `원본 전체 다운로드 (${items.length}개)`}
      </Button>
      {items.length > 1 && (
        <span className="text-xs text-muted-foreground">
          브라우저가 &quot;여러 파일 다운로드&quot; 를 물어보면 허용해주세요.
        </span>
      )}
    </div>
  );
}
