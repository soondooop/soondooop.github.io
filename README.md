# 웹퍼블리셔 포트폴리오

9년차 웹퍼블리셔 포트폴리오 웹사이트입니다.

## 기술 스택

- React 18
- Vite
- CSS3
- React Icons

## 시작하기

### 설치

```bash
npm install
```

### 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:5173](http://localhost:5173)을 열어 확인할 수 있습니다.

### 빌드

```bash
npm run build
```

### 미리보기

```bash
npm run preview
```

## 프로젝트 구조

```
portfolio/
├── src/
│   ├── components/      # React 컴포넌트
│   │   ├── Header.jsx
│   │   ├── Hero.jsx
│   │   ├── About.jsx
│   │   ├── Skills.jsx
│   │   ├── Projects.jsx
│   │   ├── Contact.jsx
│   │   └── Footer.jsx
│   ├── styles/          # 전역 스타일
│   │   └── index.css
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── package.json
└── vite.config.js
```

## 주요 기능

- 반응형 디자인 (모바일, 태블릿, 데스크톱)
- 부드러운 스크롤 애니메이션
- 프로젝트 쇼케이스
- 기술 스택 시각화
- 연락처 폼

## 커스터마이징

각 섹션의 내용은 해당 컴포넌트 파일에서 수정할 수 있습니다:

- `src/components/Hero.jsx` - 히어로 섹션
- `src/components/About.jsx` - 소개 섹션
- `src/components/Skills.jsx` - 기술 스택
- `src/components/Projects.jsx` - 프로젝트 목록
- `src/components/Contact.jsx` - 연락처 정보 및 폼

색상 테마는 `src/styles/index.css`의 CSS 변수에서 변경할 수 있습니다.
