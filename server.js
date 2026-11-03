// Node.js 기본 내장 모듈 가져오기
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

// .env.local 파일에서 환경변수 불러오는 함수
function loadEnv() {
  const envPath = path.join(__dirname, ".env.local");
  // .env.local 파일이 존재하는 경우 읽기
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    // 각 라인별 파싱
    for (const line of lines) {
      const trimmed = line.trim();
      // 주석 및 빈 줄 무시
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...vals] = trimmed.split("=");
        // 환경변수 등록 (이미 등록된 것이 없다면)
        const envKey = key.trim();
        const envVal = vals.join("=").trim();
        process.env[envKey] = envVal;
      }
    }
  }
}

// 환경변수 로드 실행
loadEnv();

// Vercel 서버리스 핸들러 함수 가져오기
const dustHandler = require("./api/dust.js");

// 서버 포트 설정 (기본 3000)
const PORT = 3000;

// 지원할 파일 확장자별 MIME 타입 정의
const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

// HTTP 서버 생성
const server = http.createServer(async (req, res) => {
  // 요청 URL 파싱
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 1. /api/dust 서버리스 엔드포인트 라우팅
  if (pathname === "/api/dust") {
    // Vercel 함수와 호환되도록 req.query 주입
    req.query = parsedUrl.query;

    // Vercel 함수와 호환되도록 res.status 메서드 구현
    res.status = function (statusCode) {
      this.statusCode = statusCode;
      return this;
    };

    // Vercel 함수와 호환되도록 res.json 메서드 구현
    res.json = function (jsonData) {
      this.setHeader("Content-Type", "application/json; charset=UTF-8");
      this.end(JSON.stringify(jsonData));
      return this;
    };

    try {
      // api/dust.js 핸들러 실행
      await dustHandler(req, res);
    } catch (err) {
      console.error("API 처리 중 에러:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "서버 내부 오류: " + err.message });
      }
    }
    return;
  }

  // 2. 정적 웹 파일 (index.html, style.css, script.js 등) 제공
  let safePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let filePath = path.join(__dirname, safePath);

  // 디렉터리 탐색 취약점 방지
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=UTF-8" });
    res.end("403 Forbidden");
    return;
  }

  // 요청된 파일의 확장자 및 MIME 타입 확인
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  // 파일 읽기 및 응답 전송
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        // 파일이 없는 경우 404
        res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
        res.end("404 Not Found");
      } else {
        // 기타 파일 에러 500
        res.writeHead(500, { "Content-Type": "text/plain; charset=UTF-8" });
        res.end("500 Server Error");
      }
    } else {
      // 정상 응답
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    }
  });
});

// 서버 리슨 시작
server.listen(PORT, () => {
  console.log(`로컬 테스트 서버가 실행되었습니다: http://localhost:${PORT}`);
  console.log(`브라우저에서 http://localhost:${PORT} 에 접속하여 확인하세요.`);
});

