/**
 * StoryboardAI — PDF Document Layout & Smart Pagination Engine (Export System V2)
 *
 * Builds an editorial-grade pdfmake document definition for A4 Portrait & A4 Landscape:
 * - Cold-white canvas, deep navy structural anchors, crisp slate hairlines
 * - Dynamic aspect-ratio image fitting (contain semantics — zero stretch, zero crop)
 * - Adaptive layout (side-by-side vs stacked) based on orientation + real image aspect ratio
 * - Height-aware pagination: normal shots stay intact (`unbreakable: true`); ultra-long shots
 *   split cleanly across pages with repeated `SHOT XX（續）` headers and zero text truncation
 * - Safe wrapping for long unbroken English prompts/URLs so text never overflows margins
 */
(function (root) {
  'use strict';

  // A4 dimensions in PDF points (1 mm = 2.83465 pt)
  const PAGE_GEOMETRY = {
    portrait: {
      width: 595.28,
      height: 841.89,
      margins: [46, 56, 46, 50], // ~16.2mm sides, 19.8mm top, 17.6mm bottom
      usableWidth: 595.28 - 92,  // 503.28 pt
      usableHeight: 841.89 - 106 // 735.89 pt
    },
    landscape: {
      width: 841.89,
      height: 595.28,
      margins: [46, 54, 46, 48],
      usableWidth: 841.89 - 92,  // 749.89 pt
      usableHeight: 595.28 - 102 // 493.28 pt
    }
  };

  const COLORS = {
    navy: '#0c1324',
    ink: '#0f172a',
    body: '#1e293b',
    muted: '#475569',
    subtle: '#64748b',
    faint: '#94a3b8',
    accent: '#2563eb',
    border: '#e2e8f0',
    borderStrong: '#cbd5e1',
    surface: '#f8fafc',
    surfaceAlt: '#f1f5f9',
    warningBg: '#fffbeb',
    warningText: '#92400e',
    warningBorder: '#fde68a'
  };

  const BRIEF_LABELS = {
    subject: '主題',
    purpose: '創作目的',
    direction: '故事方向',
    audience: '目標受眾',
    tone: '情緒與語氣',
    baseStyle: '基礎風格',
    visualStyle: '視覺風格',
    styleNotes: '風格補充說明',
    visualKeywords: '視覺關鍵字',
    constraints: '創作限制',
    avoid: '不希望出現的內容',
    duration: '目標時長',
    ratio: '畫面比例',
    requirements: '補充需求'
  };

  const CHARACTER_FIELD_LABELS = {
    name: '名稱',
    appearance: '外觀特徵',
    outfit: '服裝造型',
    personality: '個性神情',
    role: '角色定位',
    description: '角色描述'
  };

  /**
   * Insert clean line-break opportunities into ultra-long unbroken Latin/URL/prompt runs
   * (>= 28 contiguous chars without whitespace) using standard spaces (never \u200B,
   * which renders as a missing-glyph box in NotoSansTC TTF).
   */
  function safeWrapText(input, maxTokenLen = 28) {
    if (input === null || input === undefined) return '';
    const str = String(input);
    if (!str) return '';
    return str.replace(/[A-Za-z0-9_/:.?&=#~+%-]{28,}/g, (token) => {
      const parts = [];
      let cursor = '';
      for (let i = 0; i < token.length; i++) {
        const ch = token[i];
        cursor += ch;
        const isBreakChar = (ch === '/' || ch === '_' || ch === '-' || ch === '.' || ch === ',' || ch === '?' || ch === '&' || ch === '=');
        if ((isBreakChar && cursor.length >= 10) || cursor.length >= maxTokenLen) {
          parts.push(cursor);
          cursor = '';
        }
      }
      if (cursor) parts.push(cursor);
      return parts.join(' ');
    });
  }

  function truncateHeaderTitle(title, maxChars = 36) {
    const clean = String(title || '未命名分鏡').replace(/\s+/g, ' ').trim();
    if (clean.length <= maxChars) return clean;
    return clean.slice(0, maxChars - 1) + '…';
  }

  function formatDateDisplay(isoString) {
    const d = isoString ? new Date(isoString) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}`;
  }

  function formatTimecode(seconds) {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '';
    const whole = Math.floor(seconds);
    const frac = Math.round((seconds - whole) * 10);
    const mins = Math.floor(whole / 60);
    const secs = whole % 60;
    const base = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return frac > 0 ? `${base}.${frac}` : base;
  }

  function stripLeadingTimecodeForPdf(storyText) {
    if (typeof storyText !== 'string') return '';
    const trimmed = storyText.trim();
    if (!trimmed) return '';
    const stripped = trimmed.replace(
      /^\s*(?:\d{1,2}:\d{2}|\d{1,3}(?:\.\d+)?)\s*[–—\-~～]\s*(?:\d{1,2}:\d{2}|\d{1,3}(?:\.\d+)?)\s*(?:秒|s|sec|secs)?[。．.:：,\s]+/i,
      ''
    ).trim();
    return stripped || trimmed;
  }

  function formatDurationLabel(seconds, complete = true) {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '未完整計算';
    const rounded = Number(seconds.toFixed(1));
    return complete ? `${rounded} 秒` : `約 ${rounded} 秒（部分鏡頭未標明時長）`;
  }

  function parseAspectRatioFromString(ratioStr) {
    if (typeof ratioStr !== 'string') return 16 / 9;
    const m = /(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)/.exec(ratioStr);
    if (!m) return 16 / 9;
    const w = Number(m[1]);
    const h = Number(m[2]);
    return w > 0 && h > 0 ? w / h : 16 / 9;
  }

  /**
   * Compute exact `contain` dimensions inside [maxW, maxH] preserving aspect ratio.
   */
  function fitContain(aspectRatio, maxW, maxH) {
    const safeRatio = Number.isFinite(aspectRatio) && aspectRatio > 0.1 && aspectRatio < 10 ? aspectRatio : 16 / 9;
    let w = maxW;
    let h = w / safeRatio;
    if (h > maxH) {
      h = maxH;
      w = h * safeRatio;
    }
    return {
      width: Math.round(w * 10) / 10,
      height: Math.round(h * 10) / 10
    };
  }

  /**
   * Estimate visual height (in PDF points) of a text string rendered at fontSize inside boxWidth.
   */
  function estimateTextHeight(text, boxWidthPt, fontSize = 10, lineHeight = 1.5) {
    if (!text) return 0;
    const str = String(text);
    const paragraphs = str.split(/\r?\n/);
    let totalLines = 0;
    for (const para of paragraphs) {
      if (!para.trim()) {
        totalLines += 0.6;
        continue;
      }
      // Approximate glyph width: CJK ~ 1.02 * fontSize, Latin ~ 0.56 * fontSize
      let units = 0;
      for (let i = 0; i < para.length; i++) {
        const code = para.charCodeAt(i);
        units += code > 0x2e7f ? fontSize * 1.03 : fontSize * 0.56;
      }
      totalLines += Math.max(1, Math.ceil(units / Math.max(60, boxWidthPt)));
    }
    return totalLines * fontSize * lineHeight;
  }

  /**
   * Split very long text into clean paragraph/sentence chunks so continuation pages
   * flow naturally without ever truncating a single character.
   */
  function splitTextIntoChunks(text, maxCharsPerChunk = 340) {
    const clean = String(text || '').trim();
    if (!clean) return [];
    if (clean.length <= maxCharsPerChunk) return [clean];

    const paragraphs = clean.split(/\n+/);
    const chunks = [];
    for (const rawPara of paragraphs) {
      const para = rawPara.trim();
      if (!para) continue;
      if (para.length <= maxCharsPerChunk) {
        chunks.push(para);
        continue;
      }
      // Split by Chinese/English sentence boundaries first
      const sentences = para.match(/[^。！？!?\n]+[。！？!?]?/g) || [para];
      let current = '';
      for (const sentence of sentences) {
        if (sentence.length > maxCharsPerChunk) {
          if (current) { chunks.push(current); current = ''; }
          for (let i = 0; i < sentence.length; i += maxCharsPerChunk) {
            chunks.push(sentence.slice(i, i + maxCharsPerChunk));
          }
        } else if ((current + sentence).length > maxCharsPerChunk) {
          if (current) chunks.push(current);
          current = sentence;
        } else {
          current += sentence;
        }
      }
      if (current) chunks.push(current);
    }
    return chunks;
  }

  function buildSectionHeading(title, subtitle = '') {
    const stack = [
      {
        columns: [
          {
            width: 4,
            canvas: [{ type: 'rect', x: 0, y: 2, w: 3.5, h: 14, r: 1.5, color: COLORS.accent }]
          },
          {
            width: '*',
            text: title,
            fontSize: 13.5,
            bold: true,
            color: COLORS.navy,
            margin: [8, 0, 0, 0]
          },
          ...(subtitle ? [{
            width: 'auto',
            text: subtitle,
            fontSize: 9,
            color: COLORS.subtle,
            alignment: 'right',
            margin: [8, 3, 0, 0]
          }] : [])
        ]
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 6, x2: 0, y2: 6, lineWidth: 0.75, lineColor: COLORS.border }],
        margin: [0, 2, 0, 10]
      }
    ];
    return stack;
  }

  function buildSectionHeaderBar(title, subtitle, usableWidth) {
    return {
      margin: [0, 14, 0, 10],
      stack: [
        {
          columns: [
            { width: 4, canvas: [{ type: 'rect', x: 0, y: 2, w: 3.5, h: 14, r: 1.5, color: COLORS.accent }] },
            { width: '*', text: title, fontSize: 13.5, bold: true, color: COLORS.navy, margin: [8, 0, 0, 0] },
            ...(subtitle ? [{ width: 'auto', text: subtitle, fontSize: 9, color: COLORS.subtle, alignment: 'right', margin: [8, 3, 0, 0] }] : [])
          ]
        },
        {
          canvas: [{ type: 'line', x1: 0, y1: 5, x2: usableWidth, y2: 5, lineWidth: 0.75, lineColor: COLORS.border }]
        }
      ]
    };
  }

  function buildMissingImageBox(width, height, status) {
    let label = '尚無分鏡圖片';
    let sublabel = '請於專案內生成或上傳分鏡圖';

    if (status === 'failed' || status === 'download_failed') {
      label = '圖片無法載入';
      sublabel = '下載失敗或連結已過期';
    } else if (status === 'decode_failed') {
      label = '圖片無法載入';
      sublabel = '圖片格式無效或無法解碼';
    } else if (status === 'unresolved') {
      label = '圖片無法載入';
      sublabel = '圖片儲存位址尚未解析';
    } else if (status === 'unsaved') {
      label = '圖片尚未儲存';
      sublabel = '此為尚未儲存之暫存分鏡';
    } else if (status === 'generation_failed') {
      label = '圖片尚未生成完成';
      sublabel = '請於專案內重新生成';
    }

    const boxH = Math.max(56, height);
    return {
      table: {
        widths: [width],
        heights: [boxH],
        body: [[{
          stack: [
            { text: label, fontSize: 9.5, bold: true, color: COLORS.muted, alignment: 'center' },
            { text: sublabel, fontSize: 8, color: COLORS.faint, alignment: 'center', margin: [0, 3, 0, 0] }
          ],
          fillColor: COLORS.surfaceAlt,
          margin: [8, Math.max(10, Math.round((boxH - 30) / 2)), 8, 8]
        }]]
      },
      layout: {
        hLineWidth: () => 0.75,
        vLineWidth: () => 0.75,
        hLineColor: () => COLORS.borderStrong,
        vLineColor: () => COLORS.borderStrong,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0
      }
    };
  }

  function buildFramedImage(imgEntry, maxW, maxH, fallbackRatio) {
    if (imgEntry && imgEntry.status === 'ok' && imgEntry.dataUrl) {
      const dims = fitContain(imgEntry.aspectRatio || fallbackRatio, maxW, maxH);
      return {
        node: {
          table: {
            widths: [dims.width],
            body: [[{
              image: imgEntry.dataUrl,
              fit: [dims.width, dims.height],
              alignment: 'center'
            }]]
          },
          layout: {
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
            hLineColor: () => COLORS.border,
            vLineColor: () => COLORS.border,
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 0,
            paddingBottom: () => 0
          }
        },
        width: dims.width,
        height: dims.height
      };
    }
    const dims = fitContain(fallbackRatio, maxW, maxH);
    return {
      node: buildMissingImageBox(dims.width, dims.height, imgEntry?.status || 'missing'),
      width: dims.width,
      height: dims.height
    };
  }

  /**
   * Build Section A: Project Overview.
   */
  function buildOverviewSection(doc, meta, imagesByOrder, geom) {
    const project = doc.project;
    const sb = doc.storyboard;
    const fallbackRatio = parseAspectRatioFromString(project.ratio);
    const firstShot = sb.shots[0];
    const coverImg = firstShot ? imagesByOrder.get(firstShot.order) : null;

    const nodes = [];

    // Brand top label & unsaved badge
    const topCols = [
      { width: '*', text: 'STORYBOARDAI  ·  分鏡企劃書', fontSize: 9, bold: true, color: COLORS.accent, characterSpacing: 0.6 }
    ];
    if (meta?.isUnsaved) {
      topCols.push({
        width: 'auto',
        text: ' 尚未儲存草稿版本 ',
        fontSize: 8.5,
        bold: true,
        color: COLORS.warningText,
        background: COLORS.warningBg
      });
    }
    nodes.push({ columns: topCols, margin: [0, 0, 0, 6] });

    // Project Title
    nodes.push({
      text: safeWrapText(project.title, 26),
      fontSize: 20,
      bold: true,
      color: COLORS.navy,
      lineHeight: 1.3,
      margin: [0, 0, 0, 10]
    });

    // Metadata strip (clean editorial grid)
    const metaItems = [
      { label: '視覺風格', value: project.style || '未指定' },
      { label: '畫面比例', value: project.ratio || '未指定' },
      { label: '鏡頭數量', value: `${sb.shotCount} 鏡` },
      { label: '分鏡總時長', value: formatDurationLabel(sb.totalDurationSeconds, sb.durationComplete) }
    ];
    if (sb.targetDurationSeconds) {
      metaItems.push({ label: '目標時長', value: `${sb.targetDurationSeconds} 秒` });
    }
    metaItems.push({ label: '匯出日期', value: formatDateDisplay(doc.exportedAt) });
    if (Array.isArray(project.tags) && project.tags.length > 0) {
      metaItems.push({ label: '標籤', value: project.tags.join('、') });
    }

    const metaTableBody = [];
    const colsPerRow = geom.usableWidth > 600 ? 3 : 2;
    for (let i = 0; i < metaItems.length; i += colsPerRow) {
      const row = [];
      for (let c = 0; c < colsPerRow; c++) {
        const item = metaItems[i + c];
        if (item) {
          row.push({
            stack: [
              { text: item.label, fontSize: 8, color: COLORS.subtle, margin: [0, 0, 0, 2] },
              { text: safeWrapText(item.value, 24), fontSize: 9.5, bold: true, color: COLORS.ink }
            ],
            margin: [6, 5, 6, 5]
          });
        } else {
          row.push({ text: '' });
        }
      }
      metaTableBody.push(row);
    }

    const metaCard = {
      table: {
        widths: Array(colsPerRow).fill('*'),
        body: metaTableBody
      },
      layout: {
        fillColor: () => COLORS.surface,
        hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 0.75 : 0.4,
        vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length) ? 0.75 : 0.4,
        hLineColor: () => COLORS.border,
        vLineColor: () => COLORS.border
      }
    };

    // If first shot has a valid cover image, display it alongside or above metadata compactly
    if (coverImg && coverImg.status === 'ok' && coverImg.dataUrl) {
      const isPortraitImg = (coverImg.aspectRatio || fallbackRatio) < 0.95;
      const maxCoverW = isPortraitImg ? 130 : (geom.usableWidth > 600 ? 250 : 210);
      const maxCoverH = isPortraitImg ? 190 : 150;
      const fitted = buildFramedImage(coverImg, maxCoverW, maxCoverH, fallbackRatio);
      const rightW = geom.usableWidth - fitted.width - 16;

      nodes.push({
        columns: [
          { width: fitted.width, stack: [fitted.node, { text: '封面（第一鏡畫面）', fontSize: 7.5, color: COLORS.faint, alignment: 'center', margin: [0, 4, 0, 0] }] },
          { width: rightW, stack: [metaCard], margin: [16, 0, 0, 0] }
        ],
        margin: [0, 0, 0, 10]
      });
    } else {
      nodes.push({ ...metaCard, margin: [0, 0, 0, 10] });
    }

    if (meta?.isUnsaved) {
      nodes.push({
        table: {
          widths: ['*'],
          body: [[{
            text: '提醒：此分鏡企劃書由尚未儲存至雲端的生成結果匯出，圖片為本次工作階段暫存畫面。',
            fontSize: 8.5,
            color: COLORS.warningText,
            fillColor: COLORS.warningBg,
            margin: [8, 5, 8, 5]
          }]]
        },
        layout: {
          hLineWidth: () => 0.6,
          vLineWidth: () => 0.6,
          hLineColor: () => COLORS.warningBorder,
          vLineColor: () => COLORS.warningBorder
        },
        margin: [0, 0, 0, 8]
      });
    }

    return [{ unbreakable: true, stack: nodes, margin: [0, 0, 0, 8] }];
  }

  /**
   * Build Section B (Creative Brief) & Section C (Template Reference).
   */
  function buildCreativeAndTemplateSections(doc, geom) {
    const out = [];
    const originalStory = (doc.project.originalStory || '').trim();
    const brief = doc.creativeBrief;

    const briefRows = [];
    if (brief && typeof brief === 'object') {
      for (const [key, label] of Object.entries(BRIEF_LABELS)) {
        const val = brief[key];
        if (val === null || val === undefined) continue;
        if (typeof val === 'string' && !val.trim()) continue;
        if (Array.isArray(val) && val.length === 0) continue;
        const formatted = Array.isArray(val)
          ? val.join('、')
          : (key === 'duration' && typeof val === 'number' ? `${val} 秒` : String(val));
        briefRows.push([
          { text: label, fontSize: 9, bold: true, color: COLORS.muted, fillColor: COLORS.surface, margin: [6, 5, 6, 5] },
          { text: safeWrapText(formatted, 24), fontSize: 9.5, color: COLORS.body, margin: [8, 5, 6, 5] }
        ]);
      }
    }

    if (originalStory || briefRows.length > 0) {
      const storyNodes = [];
      if (originalStory) {
        const storyChunks = splitTextIntoChunks(originalStory, 420);
        storyNodes.push({
          text: '原始創作需求',
          fontSize: 9.5,
          bold: true,
          color: COLORS.muted,
          margin: [0, 0, 0, 4]
        });
        storyChunks.forEach((chunk, idx) => {
          storyNodes.push({
            text: safeWrapText(chunk, 26),
            fontSize: 10,
            color: COLORS.body,
            margin: [0, 0, 0, idx === storyChunks.length - 1 ? 8 : 5]
          });
        });
      }

      // Keep section heading with the first block so it is never orphaned at page bottom
      const firstBlock = storyNodes.length > 0
        ? storyNodes.shift()
        : null;

      out.push({
        unbreakable: true,
        stack: [
          buildSectionHeaderBar('創作企劃', 'CREATIVE BRIEF', geom.usableWidth),
          ...(firstBlock ? [firstBlock] : []),
          ...(storyNodes.length > 0 ? [storyNodes.shift()] : [])
        ]
      });

      if (storyNodes.length > 0) {
        out.push(...storyNodes);
      }

      if (briefRows.length > 0) {
        out.push({
          table: {
            widths: [108, geom.usableWidth - 108],
            dontBreakRows: true,
            body: briefRows
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => COLORS.border,
            vLineColor: () => COLORS.border
          },
          margin: [0, 2, 0, 8]
        });
      }
    }

    // Section C: Template Reference (strictly separated from actual storyboard shots)
    const tpl = doc.template;
    if (tpl && (tpl.name || tpl.id || (tpl.values && Object.keys(tpl.values).length > 0))) {
      const tplStack = [];
      const tplDesc = tpl.snapshot?.description || tpl.snapshot?.summary || '';
      const tplMetaText = [
        tpl.name ? `套用模板：${tpl.name}` : (tpl.id ? `模板編號：${tpl.id}` : ''),
        tplDesc ? `簡介：${tplDesc}` : ''
      ].filter(Boolean);

      if (tplMetaText.length > 0) {
        tplStack.push({
          text: safeWrapText(tplMetaText.join('\n'), 26),
          fontSize: 9.5,
          color: COLORS.body,
          margin: [0, 0, 0, 6]
        });
      }

      const valueEntries = tpl.values && typeof tpl.values === 'object'
        ? Object.entries(tpl.values).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
        : [];

      if (valueEntries.length > 0) {
        tplStack.push({
          table: {
            widths: [120, geom.usableWidth - 120],
            dontBreakRows: true,
            body: valueEntries.map(([k, v]) => [
              { text: safeWrapText(k, 20), fontSize: 9, bold: true, color: COLORS.muted, fillColor: COLORS.surface, margin: [6, 4, 6, 4] },
              { text: safeWrapText(typeof v === 'string' ? v : JSON.stringify(v), 24), fontSize: 9.5, color: COLORS.body, margin: [8, 4, 6, 4] }
            ])
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => COLORS.border,
            vLineColor: () => COLORS.border
          },
          margin: [0, 2, 0, 4]
        });
      }

      tplStack.push({
        text: '註：以上為原始創作參考模板與變數設定，實際拍攝內容以下方「正式分鏡」為準。',
        fontSize: 8,
        color: COLORS.faint,
        margin: [0, 3, 0, 6]
      });

      out.push({
        unbreakable: tplStack.length <= 3 && valueEntries.length <= 8,
        stack: [
          buildSectionHeaderBar('模板參考', 'TEMPLATE REFERENCE', geom.usableWidth),
          ...tplStack
        ]
      });
    }

    return out;
  }

  /**
   * Build Section D: Characters.
   */
  function buildCharactersSection(doc, geom) {
    const chars = doc.characters;
    if (!chars || typeof chars !== 'object') return [];
    const entries = Object.entries(chars);
    if (entries.length === 0) return [];

    const cards = entries.map(([charId, info]) => {
      const displayName = (info && typeof info.name === 'string' && info.name.trim())
        ? `${info.name.trim()}（${charId}）`
        : charId;

      const fieldNodes = [];
      if (info && typeof info === 'object') {
        for (const [k, v] of Object.entries(info)) {
          if (k === 'name' || v === null || v === undefined || String(v).trim() === '') continue;
          const label = CHARACTER_FIELD_LABELS[k] || k;
          const valText = typeof v === 'string' ? v : JSON.stringify(v);
          fieldNodes.push({
            text: [
              { text: `${label}：`, bold: true, color: COLORS.muted },
              { text: safeWrapText(valText, 24), color: COLORS.body }
            ],
            fontSize: 9.5,
            margin: [0, 2, 0, 2]
          });
        }
      }

      const cardContent = {
        table: {
          widths: [geom.usableWidth],
          dontBreakRows: true,
          body: [[{
            stack: [
              { text: safeWrapText(displayName, 24), fontSize: 10.5, bold: true, color: COLORS.navy, margin: [0, 0, 0, 4] },
              ...(fieldNodes.length > 0 ? fieldNodes : [{ text: '無額外角色設定描述', fontSize: 9, color: COLORS.faint }])
            ],
            fillColor: COLORS.surface,
            margin: [10, 7, 10, 7]
          }]]
        },
        layout: {
          hLineWidth: () => 0.6,
          vLineWidth: () => 0.6,
          hLineColor: () => COLORS.border,
          vLineColor: () => COLORS.border
        },
        margin: [0, 0, 0, 8]
      };

      const estHeight = estimateTextHeight(JSON.stringify(info), geom.usableWidth - 20, 9.5, 1.45) + 40;
      return estHeight < geom.usableHeight * 0.7 ? { unbreakable: true, ...cardContent } : cardContent;
    });

    const firstCard = cards.shift();
    const out = [{
      unbreakable: !firstCard || !firstCard.table || (estimateTextHeight(JSON.stringify(entries[0][1]), geom.usableWidth - 20, 9.5) < geom.usableHeight * 0.6),
      stack: [
        buildSectionHeaderBar('角色設定', `共 ${entries.length} 位角色`, geom.usableWidth),
        ...(firstCard ? [firstCard] : [])
      ]
    }];

    return out.concat(cards);
  }

  /**
   * Build structured metadata rows for a single shot.
   */
  function collectShotFields(shot, doc, includePrompts) {
    const fields = [];
    const details = shot.cameraDetails || {};
    const cameraText = (shot.camera || '').trim();
    const detailSize = typeof details.size === 'string' ? details.size.trim() : '';
    const cameraParts = [];
    if (cameraText) cameraParts.push(cameraText);
    else if (detailSize) cameraParts.push(detailSize);
    if (detailSize && cameraText && !cameraText.includes(detailSize)) {
      cameraParts.push(detailSize);
    }
    if (details.movement && !cameraText.includes(details.movement)) {
      cameraParts.push(`運鏡：${details.movement}`);
    }
    if (cameraParts.length > 0) fields.push({ label: '景別與拍攝方式', value: cameraParts.join(' · ') });

    const angle = (shot.angle || details.angle || '').trim();
    if (angle && !cameraText.includes(angle)) fields.push({ label: '拍攝角度', value: angle });

    if (shot.emotion) fields.push({ label: '情緒氛圍', value: shot.emotion });
    if (shot.purpose) fields.push({ label: '鏡頭目的', value: shot.purpose });

    const dialogueStr = typeof shot.dialogue === 'string'
      ? shot.dialogue.trim()
      : (shot.dialogue ? JSON.stringify(shot.dialogue) : '');
    if (dialogueStr) fields.push({ label: '對白／旁白', value: dialogueStr, long: true });

    if (shot.note && shot.note.trim()) fields.push({ label: '導演備註', value: shot.note.trim(), long: true });

    if (Array.isArray(shot.characters) && shot.characters.length > 0) {
      const charLabels = shot.characters.map(cid => {
        const c = doc.characters?.[cid];
        return c?.name ? `${c.name} (${cid})` : cid;
      });
      fields.push({ label: '涉及角色', value: charLabels.join('、') });
    }

    if (includePrompts) {
      const promptText = shot.prompts?.finalPrompt || shot.prompts?.shotPrompt || '';
      if (promptText.trim()) {
        fields.push({ label: 'AI 圖片提示詞', value: promptText.trim(), long: true, mono: true });
      }
    }

    return fields;
  }

  function buildShotHeaderBar(shotLabel, shot, usableWidth, isContinuation = false) {
    const startTc = formatTimecode(shot.startTimeSeconds);
    const endTc = formatTimecode(shot.endTimeSeconds);
    const timeRange = (startTc && endTc) ? `${startTc} — ${endTc}` : '';
    const durationText = shot.duration
      ? shot.duration
      : (shot.durationSeconds != null ? `${shot.durationSeconds}s` : '');
    const metaRight = [timeRange, durationText].filter(Boolean).join('    ');
    const labelColWidth = isContinuation ? 124 : 96;

    return {
      table: {
        widths: [usableWidth],
        body: [[{
          columns: [
            {
              width: labelColWidth,
              text: isContinuation ? `${shotLabel}（續）` : shotLabel,
              fontSize: isContinuation ? 10.5 : 12,
              bold: true,
              color: isContinuation ? COLORS.muted : COLORS.navy
            },
            {
              width: '*',
              text: metaRight,
              fontSize: 9,
              bold: Boolean(timeRange),
              color: COLORS.subtle,
              alignment: 'right',
              margin: [8, 1.5, 0, 0]
            }
          ],
          fillColor: isContinuation ? COLORS.surfaceAlt : COLORS.surface,
          margin: [10, isContinuation ? 4 : 5, 10, isContinuation ? 4 : 5]
        }]]
      },
      layout: {
        hLineWidth: (i) => i === 0 ? 1 : 0.6,
        vLineWidth: () => 0.6,
        hLineColor: (i) => i === 0 ? (isContinuation ? COLORS.borderStrong : COLORS.navy) : COLORS.border,
        vLineColor: () => COLORS.border
      }
    };
  }

  /**
   * Build a single shot block (either compact `unbreakable` or multi-page flowable with `SHOT XX（續）`).
   */
  function buildShotBlock(shot, doc, imagesByOrder, geom, options) {
    const shotLabel = `SHOT ${String(shot.order).padStart(2, '0')}`;
    const imgEntry = imagesByOrder.get(shot.order) || { status: shot.image?.status || 'missing' };
    const fallbackRatio = parseAspectRatioFromString(doc.project.ratio);
    const actualRatio = (imgEntry.status === 'ok' && imgEntry.aspectRatio) ? imgEntry.aspectRatio : fallbackRatio;
    const isLandscapePage = options.orientation === 'landscape';
    const isWideImage = actualRatio > 1.18;

    // Adaptive layout:
    // - Landscape page: always side-by-side (plenty of horizontal space: 750pt!)
    // - Portrait page + portrait/square image (9:16, 2:3, 1:1): side-by-side
    // - Portrait page + wide image (16:9, 3:2, 4:3): stacked so 16:9 frame stays large & legible
    const useSideBySide = isLandscapePage || !isWideImage;

    const fields = collectShotFields(shot, doc, Boolean(options.includePrompts));
    const storyText = stripLeadingTimecodeForPdf(shot.story) || '（未填寫畫面描述）';

    let imageColW, imageMaxH, textColW;
    if (useSideBySide) {
      if (isLandscapePage) {
        imageColW = isWideImage ? 290 : 165;
        imageMaxH = isWideImage ? 200 : 250;
      } else {
        imageColW = actualRatio < 0.75 ? 148 : 176;
        imageMaxH = 240;
      }
      textColW = geom.usableWidth - imageColW - 28; // padding + gap
    } else {
      imageColW = Math.min(geom.usableWidth - 20, 440);
      imageMaxH = 235;
      textColW = geom.usableWidth - 20;
    }

    const framedImg = buildFramedImage(imgEntry, imageColW, imageMaxH, fallbackRatio);

    // Estimate total content height to decide between intact (`unbreakable`) vs long-content split
    let estimatedTextH = estimateTextHeight(storyText, textColW, 10.5, 1.5) + 18;
    for (const f of fields) {
      estimatedTextH += estimateTextHeight(`${f.label}：${f.value}`, textColW, f.mono ? 8.5 : 9.5, 1.45) + 8;
    }

    const estimatedBodyH = useSideBySide
      ? Math.max(framedImg.height, estimatedTextH)
      : framedImg.height + 14 + estimatedTextH;
    const estimatedTotalH = 34 + estimatedBodyH + 22;

    const maxSinglePageH = geom.usableHeight * 0.86;

    // ── CASE 1: Normal Shot (fits cleanly on one page) ─────────
    if (estimatedTotalH <= maxSinglePageH) {
      const rightStack = [
        { text: '畫面描述', fontSize: 8.5, bold: true, color: COLORS.subtle, margin: [0, 0, 0, 3] },
        { text: safeWrapText(storyText, 24), fontSize: 10.5, color: COLORS.ink, lineHeight: 1.5, margin: [0, 0, 0, 8] }
      ];

      for (const f of fields) {
        rightStack.push({
          text: [
            { text: `${f.label}：`, bold: true, color: COLORS.muted },
            { text: safeWrapText(f.value, 22), color: f.mono ? COLORS.subtle : COLORS.body }
          ],
          fontSize: f.mono ? 8.5 : 9.5,
          lineHeight: 1.45,
          margin: [0, 0, 0, 4]
        });
      }

      const bodyNode = useSideBySide
        ? {
            columns: [
              { width: framedImg.width, stack: [framedImg.node] },
              { width: geom.usableWidth - framedImg.width - 34, stack: rightStack, margin: [14, 0, 0, 0] }
            ]
          }
        : {
            stack: [
              { alignment: 'center', columns: [{ width: '*', text: '' }, { width: framedImg.width, stack: [framedImg.node] }, { width: '*', text: '' }], margin: [0, 0, 0, 10] },
              ...rightStack
            ]
          };

      return {
        unbreakable: true,
        margin: [0, 0, 0, 14],
        stack: [
          buildShotHeaderBar(shotLabel, shot, geom.usableWidth, false),
          {
            table: {
              widths: [geom.usableWidth],
              body: [[{
                stack: [bodyNode],
                margin: [10, 10, 10, 8]
              }]]
            },
            layout: {
              hLineWidth: (i) => i === 0 ? 0 : 0.6,
              vLineWidth: () => 0.6,
              hLineColor: () => COLORS.border,
              vLineColor: () => COLORS.border
            }
          }
        ]
      };
    }

    // ── CASE 2: Ultra-Long Shot (graceful cross-page split with SHOT XX（續）) ──
    const storyChunks = splitTextIntoChunks(storyText, 280);
    const leadStory = storyChunks.shift() || '';

    // Short metadata tags stay in the lead block next to the image
    const shortFields = fields.filter(f => !f.long && f.value.length <= 80);
    const overflowItems = [];

    storyChunks.forEach((chunk, idx) => {
      overflowItems.push({
        label: idx === 0 ? '畫面描述（續）' : '',
        value: chunk,
        mono: false
      });
    });

    for (const f of fields) {
      if (!shortFields.includes(f)) {
        const chunks = splitTextIntoChunks(f.value, 320);
        chunks.forEach((chunk, idx) => {
          overflowItems.push({
            label: idx === 0 ? f.label : `${f.label}（續）`,
            value: chunk,
            mono: Boolean(f.mono)
          });
        });
      }
    }

    const leadMetaStack = [
      { text: '畫面描述', fontSize: 8.5, bold: true, color: COLORS.subtle, margin: [0, 0, 0, 3] },
      { text: safeWrapText(leadStory, 24), fontSize: 10.5, color: COLORS.ink, lineHeight: 1.5, margin: [0, 0, 0, 6] }
    ];
    for (const sf of shortFields) {
      leadMetaStack.push({
        text: [
          { text: `${sf.label}：`, bold: true, color: COLORS.muted },
          { text: safeWrapText(sf.value, 22), color: COLORS.body }
        ],
        fontSize: 9.5,
        lineHeight: 1.45,
        margin: [0, 0, 0, 3]
      });
    }

    const leadBody = useSideBySide
      ? {
          columns: [
            { width: framedImg.width, stack: [framedImg.node] },
            { width: geom.usableWidth - framedImg.width - 34, stack: leadMetaStack, margin: [14, 0, 0, 0] }
          ]
        }
      : {
          stack: [
            { columns: [{ width: '*', text: '' }, { width: framedImg.width, stack: [framedImg.node] }, { width: '*', text: '' }], margin: [0, 0, 0, 8] },
            ...leadMetaStack
          ]
        };

    const leadCard = {
      unbreakable: true,
      stack: [
        buildShotHeaderBar(shotLabel, shot, geom.usableWidth, false),
        {
          table: {
            widths: [geom.usableWidth],
            body: [[{ stack: [leadBody], margin: [10, 10, 10, 8] }]]
          },
          layout: {
            hLineWidth: (i) => i === 0 ? 0 : 0.6,
            vLineWidth: () => 0.6,
            hLineColor: () => COLORS.border,
            vLineColor: () => COLORS.border
          }
        }
      ]
    };

    if (overflowItems.length === 0) {
      return { ...leadCard, margin: [0, 0, 0, 14] };
    }

    // Continuation table: headerRows: 1 automatically repeats "SHOT XX（續）" on every continuation page!
    const contTableBody = [
      [{
        columns: [
          { width: 'auto', text: `${shotLabel}（續）`, fontSize: 10, bold: true, color: COLORS.muted },
          { width: '*', text: '詳細分鏡內容', fontSize: 8.5, color: COLORS.faint, alignment: 'right', margin: [8, 1, 0, 0] }
        ],
        fillColor: COLORS.surfaceAlt,
        margin: [10, 4, 10, 4]
      }]
    ];

    for (const item of overflowItems) {
      const cellStack = [];
      if (item.label) {
        cellStack.push({ text: item.label, fontSize: 8.5, bold: true, color: COLORS.muted, margin: [0, 0, 0, 2] });
      }
      cellStack.push({
        text: safeWrapText(item.value, 24),
        fontSize: item.mono ? 8.5 : 9.8,
        color: item.mono ? COLORS.subtle : COLORS.body,
        lineHeight: 1.5
      });
      contTableBody.push([{ stack: cellStack, margin: [10, 5, 10, 5] }]);
    }

    return {
      margin: [0, 0, 0, 14],
      _isLongSplitShot: true,
      _leadCard: leadCard,
      _contTable: {
        table: {
          widths: [geom.usableWidth],
          headerRows: 1,
          keepWithHeaderRows: 1,
          dontBreakRows: true,
          body: contTableBody
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.6 : 0.35,
          vLineWidth: () => 0.6,
          hLineColor: () => COLORS.border,
          vLineColor: () => COLORS.border
        }
      },
      stack: [
        leadCard,
        {
          table: {
            widths: [geom.usableWidth],
            headerRows: 1,
            keepWithHeaderRows: 1,
            dontBreakRows: true,
            body: contTableBody
          },
          layout: {
            hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.6 : 0.35,
            vLineWidth: () => 0.6,
            hLineColor: () => COLORS.border,
            vLineColor: () => COLORS.border
          }
        }
      ]
    };
  }

  /**
   * Build the complete pdfmake docDefinition from a serialized Export V2 bundle + loaded images.
   */
  function buildPdfDocumentDefinition(bundle, imagesByOrder = new Map(), userOptions = {}) {
    const doc = bundle?.document || bundle;
    const meta = bundle?.meta || {};
    const options = {
      orientation: userOptions.orientation === 'landscape' ? 'landscape' : 'portrait',
      includeOverview: userOptions.includeOverview !== false,
      includeBriefAndTemplate: userOptions.includeBriefAndTemplate !== false,
      includeCharacters: userOptions.includeCharacters !== false,
      includePrompts: Boolean(userOptions.includePrompts),
      quality: userOptions.quality === 'high' ? 'high' : 'standard'
    };

    const geom = PAGE_GEOMETRY[options.orientation];
    const headerTitle = truncateHeaderTitle(doc.project.title, options.orientation === 'landscape' ? 54 : 34);
    const exportDate = formatDateDisplay(doc.exportedAt);

    const content = [];

    // A. Overview
    if (options.includeOverview) {
      content.push(...buildOverviewSection(doc, meta, imagesByOrder, geom));
    }

    // B & C. Creative Brief & Template Reference
    if (options.includeBriefAndTemplate) {
      content.push(...buildCreativeAndTemplateSections(doc, geom));
    }

    // D. Characters
    if (options.includeCharacters) {
      content.push(...buildCharactersSection(doc, geom));
    }

    // E. Formal Storyboard (always included)
    const shots = Array.isArray(doc.storyboard?.shots) ? doc.storyboard.shots : [];
    const shotHeading = buildSectionHeaderBar('正式分鏡', `共 ${shots.length} 鏡`, geom.usableWidth);

    if (shots.length === 0) {
      content.push({
        unbreakable: true,
        stack: [
          shotHeading,
          { text: '此專案目前尚無分鏡鏡頭資料。', fontSize: 10, color: COLORS.subtle, margin: [0, 8, 0, 8] }
        ]
      });
    } else {
      const shotBlocks = shots.map(shot => buildShotBlock(shot, doc, imagesByOrder, geom, options));
      // Keep the "正式分鏡" heading glued to the first shot (or its leadCard for ultra-long shots)
      const firstShotBlock = shotBlocks.shift();
      if (firstShotBlock && firstShotBlock.unbreakable) {
        content.push({
          unbreakable: true,
          stack: [shotHeading, firstShotBlock]
        });
      } else if (firstShotBlock && firstShotBlock._isLongSplitShot) {
        content.push({
          margin: [0, 0, 0, 14],
          stack: [
            { unbreakable: true, stack: [shotHeading, firstShotBlock._leadCard] },
            firstShotBlock._contTable
          ]
        });
      } else {
        content.push(shotHeading);
        if (firstShotBlock) content.push(firstShotBlock);
      }
      // Strip internal helper keys from remaining blocks
      for (const blk of shotBlocks) {
        if (blk && blk._isLongSplitShot) {
          content.push({ margin: blk.margin, stack: blk.stack });
        } else {
          content.push(blk);
        }
      }
    }

    return {
      info: {
        title: `${doc.project.title || 'StoryboardAI'} — 分鏡企劃書`,
        author: 'StoryboardAI',
        subject: 'Storyboard Production Brief',
        creator: 'StoryboardAI Export System V2'
      },
      pageSize: 'A4',
      pageOrientation: options.orientation,
      pageMargins: geom.margins,
      defaultStyle: {
        font: 'NotoSansTC',
        fontSize: 10,
        lineHeight: 1.5,
        color: COLORS.body
      },
      header: (currentPage) => ({
        margin: [geom.margins[0], 18, geom.margins[2], 0],
        stack: [
          {
            columns: [
              {
                width: '*',
                text: [
                  { text: 'STORYBOARDAI', bold: true, color: COLORS.navy },
                  { text: `   |   ${headerTitle}`, color: COLORS.subtle }
                ],
                fontSize: 8.5
              },
              {
                width: 'auto',
                text: currentPage === 1 && options.includeOverview ? '專案概覽' : '分鏡企劃書',
                fontSize: 8.5,
                color: COLORS.faint,
                alignment: 'right'
              }
            ]
          },
          {
            canvas: [{ type: 'line', x1: 0, y1: 6, x2: geom.usableWidth, y2: 6, lineWidth: 0.5, lineColor: COLORS.border }]
          }
        ]
      }),
      footer: (currentPage, pageCount) => ({
        margin: [geom.margins[0], 12, geom.margins[2], 0],
        stack: [
          {
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: geom.usableWidth, y2: 0, lineWidth: 0.5, lineColor: COLORS.border }]
          },
          {
            margin: [0, 6, 0, 0],
            columns: [
              { width: '*', text: `StoryboardAI 分鏡企劃書  ·  ${exportDate}`, fontSize: 8, color: COLORS.faint },
              { width: 'auto', text: `第 ${currentPage} 頁 / 共 ${pageCount} 頁`, fontSize: 8, bold: true, color: COLORS.subtle, alignment: 'right' }
            ]
          }
        ]
      }),
      content
    };
  }

  const api = {
    PAGE_GEOMETRY,
    COLORS,
    safeWrapText,
    fitContain,
    formatTimecode,
    stripLeadingTimecodeForPdf,
    parseAspectRatioFromString,
    estimateTextHeight,
    splitTextIntoChunks,
    buildPdfDocumentDefinition
  };

  if (typeof root !== 'undefined') {
    root.StoryboardPdfLayout = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
