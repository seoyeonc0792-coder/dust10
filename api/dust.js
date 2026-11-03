// Vercel 서버리스 함수 핸들러 (Node.js 환경)
module.exports = async function handler(req, res) {
  // 브라우저 교차 출처 리소스 공유(CORS) 허용 헤더 설정
  res.setHeader("Access-Control-Allow-Origin", "*");
  // 허용할 HTTP 메서드 설정
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  // 프리플라이트(OPTIONS) 요청일 경우 즉시 200 성공 반환
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 요청 쿼리스트링에서 시도 이름(sido) 추출 (기본값: '서울')
  const sido = req.query.sido || "서울";

  // Vercel 환경변수에서 에어코리아 인증키 가져오기
  const apiKey = process.env.AIRKOREA_KEY;

  // 서버 환경변수에 인증키가 설정되어 있지 않은 경우 오류 응답
  if (!apiKey) {
    return res.status(500).json({
      error: "서버 환경변수에 AIRKOREA_KEY가 설정되어 있지 않습니다. Vercel 설정 또는 .env.local을 확인해주세요."
    });
  }

  try {
    // Decoding 키를 URL 쿼리 파라미터로 안전하게 전달하기 위해 encodeURIComponent 처리
    const encodedKey = encodeURIComponent(apiKey.trim());
    // 시도 이름도 한글이 깨지지 않도록 URI 인코딩
    const encodedSido = encodeURIComponent(sido.trim());

    // 공공데이터포털 에어코리아 대기오염정보 API 전체 요청 URL 조립
    const requestUrl = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${encodedKey}&returnType=json&sidoName=${encodedSido}&numOfRows=100&pageNo=1&ver=1.3`;

    // 공공데이터 API 서버로 비동기 GET 요청 전송
    const response = await fetch(requestUrl);

    // 응답 본문을 텍스트 형태로 먼저 읽기 (XML 에러 응답 수신 가능성 대비)
    const rawText = await response.text();

    // JSON 파싱 시도
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      // JSON 파싱 실패 시: 인증키 오류나 파라미터 오류로 공공데이터포털에서 XML 에러를 보낸 경우
      return res.status(400).json({
        error: "인증키 또는 요청값을 확인해주세요.",
        detail: "공공데이터포털에서 JSON 대신 XML 에러 메시지를 반환했습니다."
      });
    }

    // 응답 본문 내 헤더 결과 코드 확인
    const resultCode = data?.response?.header?.resultCode;
    const resultMsg = data?.response?.header?.resultMsg;

    // resultCode가 성공 코드('00')가 아닌 경우 한국어 메시지로 안내
    if (resultCode && resultCode !== "00") {
      return res.status(400).json({
        error: `공공데이터 API 오류가 발생했습니다: ${resultMsg || "결과 메시지 없음"} (결과 코드: ${resultCode})`
      });
    }

    // 정상적으로 받아온 공공데이터포털 JSON 응답을 클라이언트로 그대로 전달
    return res.status(200).json(data);

  } catch (error) {
    // 서버 처리 중 네트워크 또는 런타임 오류 발생 시 안내
    return res.status(500).json({
      error: `에어코리아 데이터 요청 중 서버 오류가 발생했습니다: ${error.message}`
    });
  }
};

