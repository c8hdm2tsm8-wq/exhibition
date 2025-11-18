// web-app/server.js 

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process'); 

const app = express();
const port = 5000; 

// --- [설정 1] 이미지 저장 폴더 생성 ---
const UPLOAD_DIR = path.join(__dirname, '..', 'image'); 
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

// --- [설정 2] 파일 저장 규칙 ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR); 
  },
  filename: (req, file, cb) => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    cb(null, `${dateStr}_${file.originalname}`);
  }
});
const upload = multer({ storage: storage });

// ---------------------------------------------------------
// ★ [핵심 수정] 보안(CORS) 모두 허용! (이게 없어서 에러 났음)
// ---------------------------------------------------------
app.use(cors()); 
app.use(express.json());

// ★ [필수] React 빌드 파일 연결 (핸드폰에서 화면 보이게 함)
app.use(express.static(path.join(__dirname, 'build')));


// --- [API] 이미지 업로드 및 분석 ---
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '업로드된 파일이 없습니다.' });
  }
  
  const userSettingsJson = req.body.settings;
  try {
      JSON.parse(userSettingsJson);
  } catch (e) {
      console.error("JSON Error:", e);
      return res.status(500).json({ success: false, message: '설정 오류' });
  }

  // Python 스크립트 실행
  const pythonScriptPath = path.join(__dirname, '..', 'ingredient.py'); 
  // ⚠️ 사용자 경로 (본인 경로 맞는지 확인!)
const pythonExecutable = 'C:\\Users\\haneul\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';

  const pythonProcess = spawn(pythonExecutable, [
      '-X', 'utf8', // 한글 깨짐 방지 옵션 (중요)
      pythonScriptPath,
      userSettingsJson,
      req.file.filename
  ], {
      cwd: path.join(__dirname, '..')
  });

  let pythonData = '';
  let pythonError = '';

  pythonProcess.stdout.setEncoding('utf8');
  pythonProcess.stderr.setEncoding('utf8');
  
  pythonProcess.stdout.on('data', (data) => pythonData += data.toString());
  pythonProcess.stderr.on('data', (data) => pythonError += data.toString());

  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Python Error: ${pythonError}`);
      return res.status(500).json({ 
          success: false, 
          message: '분석 실패', 
          errorDetail: pythonError 
      });
    }

    try {
      const result = JSON.parse(pythonData.trim());
      console.log("분석 성공:", result);
      res.json({ success: true, analysisResult: result });
    } catch (e) {
      console.error("JSON Parsing Error", pythonData);
      res.status(500).json({ success: false, message: '결과 파싱 오류', errorDetail: pythonData });
    }
  });
});

// ★ [필수] 모든 접속을 React 화면으로 연결
app.get(/.*$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
  console.log(`서버 시작됨: Port ${port}`);
});