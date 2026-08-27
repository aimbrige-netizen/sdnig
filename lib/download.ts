// 원본 파일 다운로드 주소 만들기
//
// 저장된 파일명은 UUID 라 그대로 받으면 "3f2a....jpg" 가 된다. 나중에 업체별로 찾으려면
// 못 쓰는 이름이라, 받을 때 사람이 읽는 이름을 붙여준다.
//
// Supabase 는 다른 도메인이라 <a download> 속성이 무시된다(브라우저가 크로스 오리진에서는
// 안 먹는다). 대신 Storage 가 지원하는 ?download=<파일명> 을 쓰면 Content-Disposition:
// attachment 로 내려와 저장 대화상자가 뜬다. 로컬 개발 경로는 같은 도메인이라 그냥 된다.

/** 파일 이름으로 쓸 수 없는 문자를 정리한다 */
export function safeDownloadName(raw: string, fallback = '사진'): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, '') // 윈도우에서 금지된 문자
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

/** URL 에서 확장자를 뽑는다 (없으면 .jpg) */
export function extensionOf(url: string): string {
  const path = url.split('?')[0];
  const m = /\.([a-zA-Z0-9]{1,5})$/.exec(path);
  return m ? `.${m[1].toLowerCase()}` : '.jpg';
}

/**
 * 클릭하면 저장되는 주소를 만든다.
 * @param url  저장된 원본 주소
 * @param name 확장자를 뺀 파일 이름 (예: '더그레이스 웨딩홀-갤러리 3')
 */
export function downloadHref(url: string, name: string): string {
  const filename = `${safeDownloadName(name)}${extensionOf(url)}`;
  // Supabase Storage 와 로컬 서빙 라우트가 같은 규약(?download=<파일명>)을 쓴다.
  // <a download> 속성만으로는 부족하다 — 다른 도메인에서는 브라우저가 무시하기 때문에
  // 서버가 Content-Disposition 을 내려줘야 이름이 붙는다.
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}download=${encodeURIComponent(filename)}`;
}

/**
 * 파일 하나를 받는다.
 *
 * Content-Disposition 헤더만 믿으면 안 된다. 한글 파일명은 filename*(RFC 5987)로 보내야
 * 하는데 이를 못 읽는 브라우저가 있고(그러면 "download" 라는 이름으로 저장된다), 다른
 * 도메인에서는 <a download> 속성도 무시된다.
 *
 * 그래서 파일을 먼저 받아 blob: 주소로 바꿔 저장한다. blob 은 같은 도메인 취급이라
 * download 속성이 그대로 먹고, 어떤 브라우저에서도 한글 이름이 붙는다.
 * 받아오지 못하면(네트워크·CORS) 서버가 이름을 붙여주는 ?download= 주소로 넘어간다.
 */
export async function downloadFile(url: string, name: string): Promise<void> {
  const filename = `${safeDownloadName(name)}${extensionOf(url)}`;

  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    clickDownload(objectUrl, filename);
    // 즉시 지우면 저장이 시작되기 전에 사라질 수 있다
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    clickDownload(downloadHref(url, name), filename);
  }
}

function clickDownload(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * 여러 파일을 차례로 받는다.
 *
 * 한 번에 여러 개를 걸면 브라우저가 뒤엣것을 버리므로 하나씩 순서대로 처리한다.
 * (브라우저가 "여러 파일 다운로드를 허용하시겠습니까?" 를 한 번 묻는다)
 */
export async function downloadAll(
  items: { url: string; name: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    await downloadFile(items[i].url, items[i].name);
    onProgress?.(i + 1, items.length);
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, 300));
  }
}
