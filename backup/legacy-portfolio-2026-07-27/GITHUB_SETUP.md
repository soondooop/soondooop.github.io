# GitHub 저장소 업로드 가이드

## 1단계: GitHub에서 새 저장소 생성

1. https://github.com 에 로그인
2. 우측 상단의 "+" 버튼 클릭 → "New repository" 선택
3. 저장소 정보 입력:
   - Repository name: `portfolio` (또는 원하는 이름)
   - Description: "9년차 웹퍼블리셔 포트폴리오"
   - Public 또는 Private 선택
   - **"Initialize this repository with a README" 체크하지 않기** (이미 README가 있음)
4. "Create repository" 버튼 클릭

## 2단계: 로컬 저장소와 연결

GitHub에서 저장소를 만든 후, 아래 명령어를 실행하세요:

```bash
# 원격 저장소 추가 (YOUR_USERNAME을 본인의 GitHub 사용자명으로 변경)
git remote add origin https://github.com/YOUR_USERNAME/portfolio.git

# 또는 SSH를 사용하는 경우:
# git remote add origin git@github.com:YOUR_USERNAME/portfolio.git

# 브랜치 이름을 main으로 변경 (GitHub 기본값)
git branch -M main

# GitHub에 푸시
git push -u origin main
```

## 3단계: 완료!

이제 GitHub에서 프로젝트를 확인할 수 있습니다.

## 추가 팁

### 이후 변경사항 업로드
```bash
git add .
git commit -m "변경사항 설명"
git push
```

### GitHub Pages로 배포하기
1. GitHub 저장소의 Settings → Pages로 이동
2. Source에서 "Deploy from a branch" 선택
3. Branch를 "main"으로, 폴더를 "/ (root)"로 설정
4. Save 클릭
5. Actions 탭에서 빌드가 완료되면 `https://YOUR_USERNAME.github.io/portfolio`에서 확인 가능

### Vite 프로젝트 GitHub Pages 배포 설정
`vite.config.js`에 base 경로 추가 필요:
```js
export default defineConfig({
  plugins: [react()],
  base: '/portfolio/', // 저장소 이름과 동일하게
  // ...
})
```
