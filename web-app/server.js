// web-app/server.js 

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process'); 

const app = express();
const port = 5000; 

// 이미지 저장 경로 설정 (현재 폴더의 상위 폴더에 있는 'image' 폴더)
const UPLOAD_DIR = path.join(__dirname, '..', 'image'); 

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR); 
  },
  filename: (req, file, cb) => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    // 한글 파일명 깨짐 방지를 위해 파일명 인코딩 처리 (선택사항)
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${dateStr}_${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

app.use(cors({
    origin: true, // 모든 주소에서 접속 허용 (모바일 접속 원활하게 하기 위함)
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

// ★ [추가 1] React 빌드 파일(정적 파일)들이 있는 'build' 폴더를 서버에 연결
app.use(express.static(path.join(__dirname, 'build')));

app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '업로드된 파일이 없습니다.' });
  }
  
  const userSettingsJson = req.body.settings;
  
  try {
      JSON.parse(userSettingsJson);
  } catch (e) {
      console.error("Failed to parse settings JSON:", e);
      return res.status(500).json({ success: false, message: '사용자 설정 데이터 오류.' });
  }

  // --- Python OCR 스크립트 실행 ---
  
  const pythonScriptPath = path.join(__dirname, '..', 'ingredient.py'); 
  
  // ★ [수정 2] 학교 컴퓨터의 파이썬 절대 경로 (역슬래시 2개씩 주의!)
  const pythonExecutable = 'C:\\Users\\haneul\\AppData\\Local\\Programs\\Python\\Python312\\python.exe'; 

  const pythonProcess = spawn(pythonExecutable, [
      pythonScriptPath, 
      userSettingsJson, 
      req.file.filename  
  ], {
      cwd: path.join(__dirname, '..'),
      // ★ [수정 3] 한글 출력이 깨지지 않도록 인코딩 환경변수 추가
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' } 
  });

  let pythonData = '';
  let pythonError = '';

  pythonProcess.stdout.setEncoding('utf8');
  pythonProcess.stderr.setEncoding('utf8');
  
  pythonProcess.stdout.on('data', (data) => {
    pythonData += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    pythonError += data.toString();
  });

  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`[Python Error] 스크립트 종료 코드: ${code}`);
      console.error(`[Python Stderr] ${pythonError}`);
      return res.status(500).json({ 
          success: false, 
          message: 'OCR 분석 중 오류가 발생했습니다.', 
          errorDetail: pythonError 
      });
    }

    try {
      // 파이썬 출력값 앞뒤 공백 제거 후 파싱
      const analysisResult = JSON.parse(pythonData.trim()); 
      console.log(`[Analysis Success] 결과 반환 완료`);
      
      res.json({
        success: true,
        message: '분석 완료. 결과를 확인하세요.',
        analysisResult: analysisResult
      });
      
    } catch (e) {
      console.error('Failed to parse Python output as JSON:', e);
      console.error('Raw Python Output:', pythonData);
      return res.status(500).json({ 
          success: false, 
          message: '분석 결과 파싱 오류.', 
          errorDetail: pythonData.trim() 
      });
    }
  });
});

// ★ [추가 4] 위에서 처리되지 않은 모든 요청은 React의 메인 화면(index.html)을 보여줌
// (이 코드가 있어야 새로고침이나 초기 접속 시 404 에러가 안 남)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
  console.log(`Node.js Server running on port ${port}`);
});