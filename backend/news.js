const news = [
  { zh: "中国人民银行宣布下调存款准备金率50个基点", hint: "PBOC announces 50bps RRR cut", lang: "ZH-CN", source: "Xinhua" },
  { zh: "中国国家统计局：2026年第二季度GDP同比增长4.8%", hint: "China Q2 GDP +4.8% YoY, below 5.2% forecast", lang: "ZH-CN", source: "NBS" },
  { zh: "日本銀行決定將政策利率維持在0.25%不變", hint: "Bank of Japan holds at 0.25%, hints at hikes", lang: "JA", source: "BoJ" },
  { zh: "삼성전자 2분기 영업이익 12조원, market expectations 상회 (삼성전자 2분기 영업이익 12조원, 시장 예상치 상회)", hint: "Samsung Q2 operating profit ₩12T, beats estimates", lang: "KO", source: "Samsung IR" }
];

// Let's use the exact text from user request for the last item too:
// { zh: "삼성전자 2분기 영업이익 12조원, 시장 예상치 상회", hint: "Samsung Q2 operating profit ₩12T, beats estimates", lang: "KO", source: "Samsung IR" }
// Wait, the prompt says "zh" field even for KO and JA. Let's stick strictly to "zh" as the key name!

const exactNews = [
  { zh: "中国人民银行宣布下调存款准备金率50个基点", hint: "PBOC announces 50bps RRR cut", lang: "ZH-CN", source: "Xinhua" },
  { zh: "中国国家统计局：2026年第二季度GDP同比增长4.8%", hint: "China Q2 GDP +4.8% YoY, below 5.2% forecast", lang: "ZH-CN", source: "NBS" },
  { zh: "日本銀行決定將政策利率維持在0.25%不變", hint: "Bank of Japan holds at 0.25%, hints at hikes", lang: "JA", source: "BoJ" },
  { zh: "삼성전자 2분기 영업이익 12조원, 시장 예상치 상회", hint: "Samsung Q2 operating profit ₩12T, beats estimates", lang: "KO", source: "Samsung IR" }
];

export default exactNews;
