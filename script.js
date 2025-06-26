const GITHUB_TOKEN = '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';
const REPO_OWNER = 'soondooop';
const REPO_NAME = 'soondooop';

// 방명록 등록 함수
async function submitGuestbook(event) {
    event.preventDefault();
    
    const nameInput = document.getElementById('name');
    const messageInput = document.getElementById('message');
    const passwordInput = document.getElementById('password');
    
    const name = nameInput.value;
    const message = messageInput.value;
    const password = passwordInput.value;
    
    // 비밀번호는 SHA-256으로 해시화
    const hashedPassword = await hashPassword(password);
    
    try {
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: `방명록: ${name}`,
                body: message,
                labels: ['guestbook'],
                // 비밀번호 해시를 댓글로 저장
                comments: JSON.stringify({ passwordHash: hashedPassword })
            })
        });

        if (response.ok) {
            alert('방명록이 등록되었습니다!');
            nameInput.value = '';
            messageInput.value = '';
            passwordInput.value = '';
            loadGuestbookEntries();
        } else {
            throw new Error('방명록 등록에 실패했습니다.');
        }
    } catch (error) {
        alert(error.message);
    }
}

// 비밀번호 해시 함수
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// 비밀번호 확인 함수
async function verifyPassword(issueNumber) {
    const password = prompt('비밀번호를 입력하세요:');
    if (!password) return false;

    const hashedInput = await hashPassword(password);
    const comments = await getIssueComments(issueNumber);
    const passwordHash = JSON.parse(comments[0].body).passwordHash;

    return hashedInput === passwordHash;
}

// 방명록 삭제 함수
async function deleteEntry(issueNumber) {
    if (!await verifyPassword(issueNumber)) {
        alert('비밀번호가 일치하지 않습니다.');
        return;
    }

    try {
        const response = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    state: 'closed'
                })
            }
        );

        if (response.ok) {
            alert('방명록이 삭제되었습니다.');
            loadGuestbookEntries();
        } else {
            throw new Error('삭제에 실패했습니다.');
        }
    } catch (error) {
        alert(error.message);
    }
}

// 방명록 수정 함수
async function editEntry(issueNumber) {
    if (!await verifyPassword(issueNumber)) {
        alert('비밀번호가 일치하지 않습니다.');
        return;
    }

    const editForm = document.querySelector(`#edit-form-${issueNumber}`);
    const editMessage = document.querySelector(`#edit-message-${issueNumber}`);

    try {
        const response = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    body: editMessage.value
                })
            }
        );

        if (response.ok) {
            alert('방명록이 수정되었습니다.');
            loadGuestbookEntries();
        } else {
            throw new Error('수정에 실패했습니다.');
        }
    } catch (error) {
        alert(error.message);
    }
}

// 이슈 댓글 가져오기
async function getIssueComments(issueNumber) {
    const response = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}/comments`
    );
    return await response.json();
}

// 방명록 목록 불러오기 함수
async function loadGuestbookEntries() {
    const entriesDiv = document.getElementById('guestbookEntries');
    entriesDiv.innerHTML = '로딩 중...';
    
    try {
        const response = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=guestbook&state=open&sort=created&direction=desc`
        );
        
        if (!response.ok) {
            throw new Error('방명록을 불러오는데 실패했습니다.');
        }

        const issues = await response.json();
        
        entriesDiv.innerHTML = '';
        
        issues.forEach(issue => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'guestbook-entry';
            
            const date = new Date(issue.created_at).toLocaleString('ko-KR');
            const name = issue.title.replace('방명록: ', '');
            
            entryDiv.innerHTML = `
                <div class="entry-header">
                    <strong>${name}</strong>
                    <span>${date}</span>
                </div>
                <div class="message">${issue.body}</div>
                <div class="entry-actions">
                    <button onclick="showEditForm(${issue.number})">수정</button>
                    <button onclick="deleteEntry(${issue.number})">삭제</button>
                </div>
                <div class="edit-form" id="edit-form-${issue.number}">
                    <textarea id="edit-message-${issue.number}">${issue.body}</textarea>
                    <button onclick="editEntry(${issue.number})">수정 완료</button>
                </div>
            `;
            
            entriesDiv.appendChild(entryDiv);
        });
        
        if (issues.length === 0) {
            entriesDiv.innerHTML = '<p>아직 작성된 방명록이 없습니다.</p>';
        }
    } catch (error) {
        entriesDiv.innerHTML = `<p style="color: red;">${error.message}</p>`;
    }
}

// 수정 폼 표시 함수
function showEditForm(issueNumber) {
    const editForm = document.querySelector(`#edit-form-${issueNumber}`);
    editForm.style.display = editForm.style.display === 'none' ? 'block' : 'none';
}

// 이벤트 리스너 등록
document.getElementById('guestbookForm').addEventListener('submit', submitGuestbook);

// 페이지 로드 시 방명록 목록 불러오기
window.addEventListener('load', loadGuestbookEntries);
