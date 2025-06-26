<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// 업로드 디렉토리 설정
$uploadDir = 'uploads/';
$dateDir = date('Ymd') . '/';
$fullUploadDir = $uploadDir . $dateDir;

// 디렉토리가 없으면 생성
if (!file_exists($fullUploadDir)) {
    mkdir($fullUploadDir, 0755, true);
}

// 허용된 이미지 타입
$allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $response = [];
        
        // 여러 파일 처리
        foreach ($_FILES as $file) {
            if ($file['error'] === UPLOAD_ERR_OK) {
                // 파일 타입 검증
                if (!in_array($file['type'], $allowedTypes)) {
                    throw new Exception('허용되지 않는 파일 타입입니다: ' . $file['type']);
                }
                
                // 파일 크기 검증 (10MB 제한)
                if ($file['size'] > 10 * 1024 * 1024) {
                    throw new Exception('파일 크기가 너무 큽니다. 10MB 이하로 업로드해주세요.');
                }
                
                // 고유한 파일명 생성
                $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
                $uniqueName = uniqid() . '_' . time() . '.' . $extension;
                $uploadPath = $fullUploadDir . $uniqueName;
                
                // 파일 업로드
                if (move_uploaded_file($file['tmp_name'], $uploadPath)) {
                    // 서버 URL 생성
                    $serverUrl = 'https://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['REQUEST_URI']) . '/' . $uploadPath;
                    
                    $response[] = [
                        'success' => true,
                        'url' => $serverUrl,
                        'filename' => $file['name'],
                        'size' => $file['size'],
                        'type' => $file['type']
                    ];
                } else {
                    throw new Exception('파일 업로드에 실패했습니다.');
                }
            } else {
                throw new Exception('파일 업로드 오류: ' . $file['error']);
            }
        }
        
        echo json_encode([
            'success' => true,
            'files' => $response
        ]);
        
    } else {
        throw new Exception('POST 요청만 허용됩니다.');
    }
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?> 