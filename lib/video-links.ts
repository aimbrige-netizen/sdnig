// 영상 링크(유튜브·비메오·네이버TV 등) 파싱
//
// 영상 파일을 직접 올리면 Supabase 무료 플랜의 파일당 50MB 한도에 걸리고 저장 용량·전송량도
// 먹는다. 업체가 이미 유튜브에 올려둔 샘플 영상이 있으면 링크만 저장하는 편이 제약이 없다.
// 여기서는 링크를 표준 형태로 정리하고, 화면에 보여줄 미리보기 정보를 뽑아낸다.

export type VideoProvider = 'youtube' | 'vimeo' | 'navertv' | 'other';

export interface ParsedVideoLink {
  provider: VideoProvider;
  /** 제공자별 영상 ID (other 면 빈 문자열) */
  id: string;
  /** 정리된 시청 주소 — 저장·표시에 이 값을 쓴다 */
  url: string;
  /** 미리보기 이미지 주소 (없으면 null) */
  thumbnail: string | null;
  /** 사람이 읽는 제공자 이름 */
  label: string;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return YT_ID.test(id) ? id : null;
  }
  if (host !== 'youtube.com' && host !== 'music.youtube.com') return null;

  const v = u.searchParams.get('v');
  if (v && YT_ID.test(v)) return v;

  // /shorts/ID, /embed/ID, /live/ID, /v/ID
  const m = /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/.exec(u.pathname);
  return m ? m[1] : null;
}

function vimeoId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '');
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
  // /123456789, /channels/staffpicks/123456789, /video/123456789
  const m = /(?:^|\/)(\d{6,})(?:\/|$)/.exec(u.pathname);
  return m ? m[1] : null;
}

function naverTvId(u: URL): string | null {
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host !== 'tv.naver.com') return null;
  const m = /^\/v\/(\d+)/.exec(u.pathname);
  return m ? m[1] : null;
}

/**
 * 입력한 주소를 해석한다. 형식이 아니거나 http(s) 가 아니면 null.
 *
 * javascript: 같은 스킴을 막기 위해 http/https 만 받는다.
 */
export function parseVideoLink(raw: string): ParsedVideoLink | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 사용자는 보통 'youtube.com/...' 처럼 스킴 없이 붙여넣는다
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname.includes('.')) return null;

  const yt = youtubeId(u);
  if (yt) {
    return {
      provider: 'youtube',
      id: yt,
      url: `https://www.youtube.com/watch?v=${yt}`,
      thumbnail: `https://img.youtube.com/vi/${yt}/hqdefault.jpg`,
      label: '유튜브',
    };
  }

  const vm = vimeoId(u);
  if (vm) {
    return {
      provider: 'vimeo',
      id: vm,
      url: `https://vimeo.com/${vm}`,
      thumbnail: null, // 비메오는 키 없이 받을 수 있는 썸네일 주소가 없다
      label: '비메오',
    };
  }

  const nv = naverTvId(u);
  if (nv) {
    return {
      provider: 'navertv',
      id: nv,
      url: `https://tv.naver.com/v/${nv}`,
      thumbnail: null,
      label: '네이버TV',
    };
  }

  // 아는 제공자가 아니어도 https 주소면 그대로 보관한다 (구글 드라이브 공유 링크 등)
  return {
    provider: 'other',
    id: '',
    url: u.toString(),
    thumbnail: null,
    label: u.hostname.replace(/^www\./, ''),
  };
}

/** 저장된 링크가 유효한 http(s) 주소인지 (서버 검증용) */
export function isValidVideoLink(url: string): boolean {
  return parseVideoLink(url) !== null;
}
