# Smart Alarm

브라우저에서 사용하는 학교 시간표·일정 알람입니다.

**접속:** https://expandsource.github.io/alram-test/

- 알람 시간·이름·활성화 여부 편집, 5분 미루기
- 브라우저에서 합성하는 8가지 알람음과 볼륨·반복 설정
- Light / Dark 테마 및 모바일 화면 지원
- 알람 설정과 테마는 기기별 브라우저 localStorage에 저장

처음 접속한 뒤 소리 활성화 버튼을 누르세요. 알람을 사용하려면 탭을 열어두고 기기의 절전을 해제해야 합니다. 백그라운드에서는 브라우저 정책에 따라 알람이 지연될 수 있습니다.

## 로컬 실행

```sh
npm ci
npm run dev
```

## 배포

`main`에 push하면 GitHub Actions가 빌드한 `dist`를 GitHub Pages에 자동 배포합니다. 저장소 Settings → Pages의 Source는 GitHub Actions를 사용합니다.

```sh
npm run build
npm run preview
```

백엔드나 데이터베이스 없이 정적 파일로 실행됩니다. 글꼴은 Google Fonts에서 불러옵니다.
