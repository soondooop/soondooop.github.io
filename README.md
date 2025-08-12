<<<<<<< HEAD
# 🛒 최저가 비교 사이트

전 세계 쇼핑몰의 가격을 한 번에 비교하여 최저가를 찾아주는 React 웹 애플리케이션입니다.

## ✨ 주요 기능

### 🔍 검색 기능
- **실시간 검색**: 상품명으로 검색
- **인기 검색어**: 자주 검색되는 상품들
- **로딩 애니메이션**: 검색 중 시각적 피드백

### 💰 가격 비교
- **다중 쇼핑몰**: 쿠팡, 11번가, G마켓, 네이버, 티몬, 위메프
- **최저가 표시**: 🏆 최저가 배지와 요약 정보
- **가격 정렬**: 자동으로 가격순 정렬
- **총 결제금액**: 상품가 + 배송비 계산

### 📱 상품 정보
- **상품 이미지**: 각 쇼핑몰별 상품 이미지
- **평점 시스템**: 별점과 리뷰 수 표시
- **할인 정보**: 원가 대비 할인율 표시
- **배송 정보**: 무료배송/배송비 표시
- **상품 특징**: 무료배송, 빠른배송, 안전거래 등

### 🎨 사용자 경험
- **반응형 디자인**: 모바일/데스크톱 완벽 지원
- **호버 효과**: 카드 호버 시 애니메이션
- **그라데이션 배경**: 모던한 디자인
- **직접 링크**: 각 쇼핑몰로 바로 이동

## 🚀 기술 스택

- **React**: 프론트엔드 프레임워크
- **Axios**: API 통신 (실제 API 연동 가능)
- **React Icons**: 아이콘 라이브러리
- **CSS Grid**: 반응형 레이아웃
- **모의 데이터**: 실제 API 대신 샘플 데이터

## 📦 설치 및 실행

### 1. 저장소 클론
```bash
git clone [저장소 URL]
cd price-comparison-new
```

### 2. 의존성 설치
```bash
npm install
```

### 3. 개발 서버 실행
```bash
npm start
```

브라우저에서 `http://localhost:3000`에 접속하면 애플리케이션을 확인할 수 있습니다.

## 🔧 실제 API 연동 방법

현재는 모의 데이터를 사용하지만, 실제 쇼핑몰 API로 쉽게 교체 가능:

1. **다나와 API**: 가격 비교 전문
2. **네이버 쇼핑 API**: 네이버 쇼핑 검색
3. **쿠팡 파트너스 API**: 쿠팡 상품 정보
4. **11번가 API**: 11번가 상품 검색

## 📱 사용 방법

1. **검색창에 상품명 입력** (예: iPhone 15, 삼성 갤럭시)
2. **인기 검색어 클릭** 또는 **직접 검색**
3. **가격 비교 결과 확인**
4. **최저가 상품 클릭**하여 해당 쇼핑몰으로 이동

## 🎯 프로젝트 구조

```
src/
├── components/
│   ├── SearchBar.js          # 검색 컴포넌트
│   ├── SearchBar.css         # 검색 스타일
│   ├── ProductCard.js        # 상품 카드 컴포넌트
│   └── ProductCard.css       # 상품 카드 스타일
├── App.js                    # 메인 앱 컴포넌트
├── App.css                   # 앱 전체 스타일
└── index.js                  # 앱 진입점
```

## 🌟 주요 특징

- **모던 UI/UX**: 그라데이션과 애니메이션으로 현대적인 디자인
- **반응형**: 모든 디바이스에서 완벽하게 작동
- **성능 최적화**: React 최적화 기법 적용
- **확장 가능**: 새로운 쇼핑몰 API 쉽게 추가 가능

## 📄 라이선스
=======
<<<<<<< HEAD
# 📸 CKEditor 4 다중 이미지 업로드 매크로

CKEditor 4에서 여러 이미지를 한 번에 업로드할 수 있는 매크로입니다. 기존 CKEditor 4의 단일 이미지 업로드 제한을 해결하여 여러 이미지를 효율적으로 관리할 수 있습니다.

**🔒 보안**: 무료로 사용 가능한 안전한 CKEditor 4.22.1 버전을 사용합니다.

## 🚀 주요 기능

### ✨ 다중 이미지 선택
- 여러 이미지 파일을 한 번에 선택 가능
- 드래그 앤 드롭 지원
- 이미지 파일 타입 자동 필터링

### 🎯 키보드 단축키
- **Ctrl + Shift + I**: 이미지 선택 대화상자 열기
- **Ctrl + Shift + U**: 선택된 이미지들을 에디터에 삽입
- **Ctrl + Shift + C**: 선택된 이미지들을 클립보드에 복사
- **Ctrl + Shift + D**: 모든 선택된 이미지 제거

### 🖼️ 이미지 미리보기
- 선택된 이미지들의 썸네일 미리보기
- 개별 이미지 제거 기능
- 이미지 파일명 표시

### 📊 진행률 표시
- 이미지 삽입 진행률 바
- 실시간 상태 메시지
- 성공/오류/정보 알림

## 📁 파일 구조

```
test_dir/
├── ckeditor-multi-upload.html    # 메인 매크로 파일
├── README.md                     # 사용법 설명서
└── cssToScss/                    # 기존 프로젝트 폴더
    ├── css/
    └── index.html
```

## 🛠️ 사용 방법

### 1. 기본 사용법
1. `ckeditor-multi-upload.html` 파일을 웹 브라우저에서 열기
2. "📂 이미지 파일 선택" 버튼 클릭하여 여러 이미지 선택
3. 선택된 이미지들이 미리보기 영역에 표시됨
4. "📤 에디터에 삽입" 버튼 클릭하여 CKEditor에 삽입

### 2. 드래그 앤 드롭 사용법
1. 이미지 파일들을 선택
2. 업로드 영역으로 드래그 앤 드롭
3. 자동으로 이미지가 선택되고 미리보기 표시

### 3. 단축키 사용법
- **Ctrl + Shift + I**: 빠른 이미지 선택
- **Ctrl + Shift + U**: 빠른 에디터 삽입
- **Ctrl + Shift + D**: 모든 이미지 제거

## 🔧 기술적 특징

### 이미지 처리
- Base64 인코딩을 통한 클라이언트 사이드 이미지 처리
- FileReader API를 활용한 비동기 이미지 로딩
- 자동 이미지 크기 조정 (max-width: 100%)

### 브라우저 호환성
- 모던 브라우저 지원 (Chrome, Firefox, Safari, Edge)
- CKEditor 4.22.1 버전 호환 (무료 버전, 보안 패치 적용)
- 반응형 디자인 지원

### 성능 최적화
- 비동기 이미지 처리로 UI 블로킹 방지
- 진행률 표시로 사용자 경험 향상
- 메모리 효율적인 이미지 관리

## ⚙️ 설정 옵션

### CKEditor 설정
```javascript
CKEDITOR.replace('editor', {
    height: 400,
    filebrowserUploadUrl: '/upload/', // 실제 업로드 URL로 변경
    filebrowserImageUploadUrl: '/upload/', // 실제 업로드 URL로 변경
    // 추가 설정...
});
```

### 이미지 삽입 스타일
```javascript
const imgHtml = `<img src="${e.target.result}" alt="${file.name}" style="max-width: 100%; height: auto; margin: 10px 0;">`;
```

## 🎨 커스터마이징

### 색상 테마 변경
CSS 변수를 수정하여 색상 테마를 변경할 수 있습니다:

```css
:root {
    --primary-color: #007bff;
    --success-color: #28a745;
    --danger-color: #dc3545;
    --background-color: #f5f5f5;
}
```

### 이미지 크기 조정
미리보기 이미지 크기를 조정하려면:

```css
.image-preview img {
    max-width: 200px;  /* 원하는 크기로 변경 */
    max-height: 200px; /* 원하는 크기로 변경 */
}
```

## 🔒 보안 고려사항

### 클라이언트 사이드 처리
- 모든 이미지 처리가 클라이언트에서 이루어짐
- 서버 업로드 없이 Base64 인코딩 사용
- 개인정보 보호 및 서버 부하 감소

### 파일 타입 검증
- 이미지 파일 타입 자동 필터링
- MIME 타입 검증
- 안전한 파일 처리

## 🐛 문제 해결

### 일반적인 문제들

1. **이미지가 표시되지 않는 경우**
   - 브라우저 콘솔에서 오류 메시지 확인
   - 이미지 파일 형식 확인 (JPG, PNG, GIF 등)

2. **단축키가 작동하지 않는 경우**
   - 브라우저의 다른 확장 프로그램과 충돌 확인
   - 키보드 레이아웃 확인

3. **드래그 앤 드롭이 작동하지 않는 경우**
   - 브라우저 보안 설정 확인
   - HTTPS 환경에서 사용 권장

### 디버깅
브라우저 개발자 도구의 콘솔에서 다음 메시지들을 확인할 수 있습니다:
- "다중 이미지 업로드 매크로가 준비되었습니다."
- "CKEditor가 준비되었습니다."

## 📝 라이선스
>>>>>>> a44b4a42a0bb54c636e0bdd8b3649b02efbb6283

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 🤝 기여하기

<<<<<<< HEAD
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

**즐거운 쇼핑하세요! 🛍️✨**
=======
버그 리포트나 기능 제안은 언제든 환영합니다!

---

**참고**: 이 매크로는 CKEditor 4의 기본 기능을 확장한 것이며, CKEditor 5나 다른 버전에서는 작동하지 않을 수 있습니다. CKEditor 4.23.0 이상 버전은 상업용 라이선스가 필요하므로 무료 사용을 위해 4.22.1 버전을 사용합니다. 
=======
# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

# SOONDOOOP's Portfolio

프론트엔드 김승도의 포트폴리오입니다.
>>>>>>> 684a4133b16aabdddb8a5503b5ce4f83d396e059
>>>>>>> a44b4a42a0bb54c636e0bdd8b3649b02efbb6283
