document.addEventListener('DOMContentLoaded', function() {
    const lengthInput = document.getElementById('length');
    const widthInput = document.getElementById('width');
    const heightInput = document.getElementById('height');
    const weightInput = document.getElementById('weight');
    const weightUnitSelect = document.getElementById('weightUnit');
    const divisorSelect = document.getElementById('divisor');
    const calculateBtn = document.getElementById('calculateBtn');
    const resultContainer = document.getElementById('result');
    const volumetricWeightDisplay = document.getElementById('volumetricWeight');
    const volumetricWeightOriginalDisplay = document.getElementById('volumetricWeightOriginal');
    const actualWeightDisplay = document.getElementById('actualWeight');
    const actualWeightItem = document.getElementById('actualWeightItem');
    const chargeableWeightDisplay = document.getElementById('chargeableWeight');

    // 숨겨진 영역의 입력 필드에 tabindex 관리 함수
    function updateTabIndex(contentElement, isHidden) {
        const inputs = contentElement.querySelectorAll('input, select, button');
        inputs.forEach(input => {
            if (isHidden) {
                input.setAttribute('tabindex', '-1');
            } else {
                input.removeAttribute('tabindex');
            }
        });
    }

    // 초기 로드 시 숨겨진 영역의 tabindex 설정
    function initializeTabIndex() {
        const allContentGroups = document.querySelectorAll('.form-group-content');
        allContentGroups.forEach(group => {
            const isHidden = group.classList.contains('hidden');
            updateTabIndex(group, isHidden);
        });
        
        // 모든 토글 버튼에 tabindex="-1" 설정
        const allToggleButtons = document.querySelectorAll('.toggle-btn');
        allToggleButtons.forEach(btn => {
            btn.setAttribute('tabindex', '-1');
        });
    }

    // 초기화
    initializeTabIndex();

    // 토글 버튼 기능
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const targetContent = document.getElementById(targetId);
            const isHidden = targetContent.classList.contains('hidden');
            
            if (isHidden) {
                targetContent.classList.remove('hidden');
                this.classList.remove('collapsed');
                // 아이콘 방향 변경
                const icon = this.querySelector('.toggle-icon');
                if (icon.textContent === '▶') {
                    icon.textContent = '▼';
                }
                // tabindex 제거 (포커스 가능하도록)
                updateTabIndex(targetContent, false);
            } else {
                targetContent.classList.add('hidden');
                this.classList.add('collapsed');
                // 아이콘 방향 변경
                const icon = this.querySelector('.toggle-icon');
                if (icon.textContent === '▼') {
                    icon.textContent = '▶';
                }
                // tabindex 추가 (포커스 불가능하도록)
                updateTabIndex(targetContent, true);
            }
        });
    });

    function calculateVolumetricWeight() {
        const length = parseFloat(lengthInput.value) || 0;
        const width = parseFloat(widthInput.value) || 0;
        const height = parseFloat(heightInput.value) || 0;
        const weightValue = parseFloat(weightInput.value) || 0;
        const weightUnit = weightUnitSelect.value;
        const divisor = parseFloat(divisorSelect.value);

        // 입력값 검증
        if (length <= 0 || width <= 0 || height <= 0) {
            alert('가로, 세로, 높이를 모두 입력해주세요.');
            return;
        }

        // 실제 무게 영역이 숨겨져 있는지 확인
        const weightGroup = document.getElementById('weight-group');
        const isWeightHidden = weightGroup.classList.contains('hidden');
        
        // 무게 단위 변환 (g을 kg으로 변환하여 계산)
        // 실제 무게가 숨겨져 있거나 입력값이 없으면 0으로 처리
        const actualWeightKg = (isWeightHidden || weightValue === 0) 
            ? 0 
            : (weightUnit === 'g' ? weightValue / 1000 : weightValue);

        // 부피무게 계산 (kg 단위)
        const volume = length * width * height;
        const volumetricWeightKg = volume / divisor;

        // 운임 기준 무게 계산 (실제 무게와 부피무게 중 큰 값, kg 단위)
        // 실제 무게가 없으면 부피무게만 사용
        const chargeableWeightKg = actualWeightKg > 0 
            ? Math.max(actualWeightKg, volumetricWeightKg)
            : volumetricWeightKg;

        // 결과 표시 (g 단위로 변환, 반올림)
        const volumetricWeightG = Math.round(volumetricWeightKg * 1000);
        const volumetricWeightGOriginal = volumetricWeightKg * 1000; // 소수점 포함 원래 값
        const actualWeightG = Math.round(actualWeightKg * 1000);
        const chargeableWeightG = Math.round(chargeableWeightKg * 1000);

        volumetricWeightDisplay.textContent = `${volumetricWeightG.toLocaleString()} g`;
        volumetricWeightDisplay.setAttribute('data-value', volumetricWeightG);
        volumetricWeightOriginalDisplay.textContent = `(${volumetricWeightGOriginal.toFixed(2)} g)`;
        
        // 실제 무게가 입력되었을 때만 표시
        if (actualWeightKg > 0 && !isWeightHidden) {
            actualWeightDisplay.textContent = `${actualWeightG.toLocaleString()} g`;
            actualWeightDisplay.setAttribute('data-value', actualWeightG);
            actualWeightItem.style.display = 'flex';
        } else {
            actualWeightItem.style.display = 'none';
        }
        
        chargeableWeightDisplay.textContent = `${chargeableWeightG.toLocaleString()} g`;
        chargeableWeightDisplay.setAttribute('data-value', chargeableWeightG);

        // 결과 컨테이너 표시
        resultContainer.classList.remove('hidden');

        // 결과를 부드럽게 스크롤
        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 계산 버튼 클릭 이벤트
    calculateBtn.addEventListener('click', calculateVolumetricWeight);

    // Enter 키 입력 시 계산
    [lengthInput, widthInput, heightInput, weightInput].forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                calculateVolumetricWeight();
            }
        });
    });

    // 복사 버튼 기능
    const copyButtons = document.querySelectorAll('.copy-btn');
    copyButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const targetElement = document.getElementById(targetId);
            const valueToCopy = targetElement.getAttribute('data-value');
            
            if (valueToCopy && valueToCopy !== '0' && valueToCopy !== '-') {
                // 클립보드에 숫자만 복사
                navigator.clipboard.writeText(valueToCopy).then(() => {
                    // 복사 성공 피드백
                    const originalText = this.textContent;
                    this.textContent = '✓';
                    this.style.color = '#4caf50';
                    
                    setTimeout(() => {
                        this.textContent = originalText;
                        this.style.color = '';
                    }, 1000);
                }).catch(err => {
                    console.error('복사 실패:', err);
                    alert('복사에 실패했습니다.');
                });
            }
        });
    });
});

