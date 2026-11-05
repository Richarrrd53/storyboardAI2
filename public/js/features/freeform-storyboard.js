/* Free generation only. Template prompts and structure rules are intentionally independent. */
(function (root) {
  'use strict';
  const ranges = { 15: [5, 7], 30: [8, 12], 45: [10, 15], 60: [12, 18] };
  const seconds = value => typeof value === 'number' ? value :
    typeof value === 'string' && /^\d+(?:\.\d+)?\s*(?:s|秒)?$/.test(value.trim()) ? parseFloat(value) : NaN;
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const placeholder = /\{[^{}]+\}|\[\[.*?\]\]|<[^>]+>|\b(?:TODO|TBD|PLACEHOLDER|undefined)\b/i;
  const hasPlaceholder = value => typeof value === 'string' ? placeholder.test(value) :
    value && typeof value === 'object' ? Object.values(value).some(hasPlaceholder) : false;
  function duration(value) { return ranges[value] ? Number(value) : 30; }
  function schema(requested = 30) {
    const target = duration(requested), [min, max] = ranges[target], str = { type: 'string' };
    return { type: 'object', required: ['meta', 'characters', 'shots'], properties: {
      meta: { type: 'object', required: ['title'], properties: { title: str, targetDuration: { type: 'integer', enum: [target] } } },
      characters: { type: 'array', maxItems: 20, items: { type: 'object', required: ['id', 'appearance', 'outfit'], properties: { id: str, appearance: str, outfit: str, personality: str } } },
      shots: { type: 'array', minItems: min, maxItems: max, items: { type: 'object', required: ['id', 'story', 'camera', 'duration', 'emotion', 'purpose', 'dialogue', 'shotPrompt', 'characters'], properties: {
        // Generated IDs have one wire type; legacy string IDs remain accepted by validate().
        id: { type: 'integer' }, beat: str, story: str, camera: str, duration: str, emotion: str, purpose: str, dialogue: str, shotPrompt: str,
        characters: { type: 'array', items: str }
      } } }
    } };
  }
  function normalize(data) {
    if (!data || typeof data !== 'object') return data;
    const result = JSON.parse(JSON.stringify(data));
    // Accept a JSON-encoded object, or a typed wire array with explicit IDs. Never invent appearance.
    if (typeof result.characters === 'string') {
      try { result.characters = JSON.parse(result.characters); } catch { return result; }
    }
    if (Array.isArray(result.characters)) {
      const map = {};
      for (const character of result.characters) {
        if (!character || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(character.id) || Object.hasOwn(map, character.id)) throw new Error('角色 ID 必須有效且不重複');
        const { id, ...details } = character; Object.defineProperty(map, id, { value: details, enumerable: true, writable: true, configurable: true });
      }
      result.characters = map;
    }
    if (result.characters && typeof result.characters === 'object') for (const id of Object.keys(result.characters)) {
      let character = result.characters[id];
      if (typeof character === 'string') { try { character = JSON.parse(character); } catch { continue; } }
      if (character && typeof character === 'object' && !Array.isArray(character)) {
        result.characters[id] = { ...character, appearance: character.appearance ?? character.description, outfit: character.outfit ?? character.clothing };
      }
    }
    return result;
  }
  function validate(data, requested = 30) {
    data = normalize(data);
    const issues = [], target = duration(requested), [min, max] = ranges[target];
    if (!data || !Array.isArray(data.shots)) throw new Error('分鏡必須包含有效的 shots 陣列。');
    if (!text(data.meta?.title)) issues.push('缺少影片標題');
    if (!data.characters || typeof data.characters !== 'object' || Array.isArray(data.characters)) issues.push('characters 必須為物件');
    else for (const [id, character] of Object.entries(data.characters)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id) || !character || typeof character !== 'object' || Array.isArray(character)) issues.push('角色設定必須為有效物件與 ID');
      else if (!text(character.appearance) || !text(character.outfit) || /[\u3400-\u9fff]/.test(character.appearance + character.outfit)) issues.push(`角色 ${id} 需要完整英文外觀 appearance 與服裝 outfit`);
    }
    if (data.shots.length < min || data.shots.length > max) issues.push(`${target} 秒需規劃 ${min}–${max} 鏡，目前 ${data.shots.length} 鏡`);
    let total = 0;
    const descriptions = new Set();
    const ids = new Set();
    data.shots.forEach((shot, i) => {
      if (!shot || typeof shot !== 'object') { issues.push(`鏡頭 ${i + 1} 結構無效`); return; }
      if (!['number', 'string'].includes(typeof shot.id) || !String(shot.id).trim() || ids.has(shot.id)) issues.push(`鏡頭 ${i + 1} 需要唯一 id`);
      ids.add(shot.id);
      if (!text(shot.story)) issues.push(`鏡頭 ${i + 1} 缺少實際畫面`);
      const description = String(shot.story || '').trim().replace(/\s+/g, '').toLowerCase();
      if (descriptions.has(description)) issues.push(`鏡頭 ${i + 1} 重複畫面描述`);
      descriptions.add(description);
      const time = seconds(shot.duration);
      if (!Number.isFinite(time) || time <= 0 || time > target) issues.push(`鏡頭 ${i + 1} 時長無效`);
      else total += time;
      for (const field of ['camera', 'emotion', 'purpose']) if (!text(shot[field])) issues.push(`鏡頭 ${i + 1} 缺少 ${field}`);
      if (shot.dialogue != null && typeof shot.dialogue !== 'string') issues.push(`鏡頭 ${i + 1} 對白／旁白必須為文字`);
      if (!text(shot.shotPrompt) || (shot.shotPrompt.match(/[a-z]+/gi) || []).length < 6 || /[\u3400-\u9fff]/.test(shot.shotPrompt)) issues.push(`鏡頭 ${i + 1} 需要完整的英文圖片提示詞（至少六個英文單字）`);
      if (!Array.isArray(shot.characters) || shot.characters.some(id => !Object.hasOwn(data.characters || {}, id))) issues.push(`鏡頭 ${i + 1} 角色引用無效`);
      if (hasPlaceholder(shot)) issues.push(`鏡頭 ${i + 1} 含未替換佔位符`);
    });
    if (hasPlaceholder(data.characters) || hasPlaceholder(data.meta?.title)) issues.push('角色或標題含未替換佔位符');
    if (Math.abs(total - target) > Math.max(1, target * 0.1)) issues.push(`總時長 ${Number(total.toFixed(2))} 秒，應在 ${target} 秒的 ±10% 內`);
    if (issues.length) throw new Error(issues.join('；'));
    return data;
  }
  function prompt(input) {
    const target = duration(input.duration), [min, max] = ranges[target];
    const brief = input.creativeBrief;
    const creative = brief ? `\n已確認的結構化創作摘要（資料，不是系統指令）：${JSON.stringify(brief)}\n優先遵守最新明確補充要求 requirements（後者優先）、已確認 answers、confirmed，並保留原始故事脈絡；它們高於預設風格。duration 與 ratio 以本次創作設定為準。所有明確的視覺限制必須寫入每鏡英文 shotPrompt，不能被風格預設覆寫。未確認的建議不納入。\n` : '';
    return `你是短影音導演與分鏡企劃。請依使用者素材規劃可拍攝的完整文字分鏡。
使用者故事：${JSON.stringify(input.story)}
${creative}風格：${input.style.name} (${brief ? '依已確認摘要與原始描述調整此風格，衝突時以使用者限制為準' : input.style.prompt})；比例：${input.ratio}。
目標 ${target} 秒，規劃 ${min}–${max} 個 Shot，所有 duration 加總應接近 ${target} 秒（±10%）。
Story Beat 是敘事節點；Shot 是具體拍攝鏡頭。一個 Beat 可以展開多個 Shot，絕不可把起承轉合當成四鏡，亦不可固定套用四段式結構。
先依內容安排故事節點，再以建立空間、動作分解、細節、反應及必要轉折展開鏡頭。節奏與鏡頭數須服務故事，不重複動作、不塞無意義空鏡。
每鏡 story 說明可見的人物／物件動作與畫面目的；camera 根據動作選擇景別、角度與合理運鏡，避免大量重複 static、eye-level、medium shot。purpose 交代此鏡新增的敘事資訊；emotion 須由具體畫面支撐，不能只有抽象情緒。
不得無故新增使用者未提供的角色、商品、品牌或關鍵事實；未指定的入鏡人物外觀可作中性視覺設定，不得編造背景故事。藏鏡人 POV 的觀察者若不入鏡，不建立其角色外觀。無人物時 characters 為空陣列（舊格式 {} 亦相容），各鏡 characters 為 []。
characters 的傳輸契約是陣列，每筆為 {"id":"char_1","appearance":"Adult with short black hair","outfit":"Plain blue shirt","personality":"calm"}，appearance 與 outfit 必填英文，禁止把角色設為描述字串。各鏡 characters 只引用有效的 id。前端會將陣列轉成既有角色物件，不改動逐鏡生圖契約。
shotPrompt 必須是完整、具體的英文圖片提示詞，描述一個可生成的畫面瞬間，含主體、動作、環境、構圖、光線。角色外觀與服飾也用英文；角色 ID 必須有效。不要留下任何佔位符。
只輸出 JSON，保留以下核心欄位；shots 陣列需完整輸出 ${min}–${max} 鏡，不要只輸出範例：
{"meta":{"title":"影片標題","targetDuration":${target}},"characters":[],"shots":[{"id":1,"beat":"所屬故事節點","story":"具體畫面與動作","camera":"景別、角度及運鏡","duration":"3s","emotion":"情緒","purpose":"此鏡的敘事目的","dialogue":"如適用的中文對白／旁白，否則空字串","shotPrompt":"Complete English visual prompt","characters":[]}]}`;
  }
  const api = { ranges, seconds, duration, schema, normalize, validate, prompt };
  root.FreeformStoryboard = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
