// 在Node.js 18+中，fetch是内置的
// 如果是较老版本，会回退到node-fetch
let fetch;
let SharedNutrition;
try {
  fetch = globalThis.fetch || require('node-fetch');
  SharedNutrition = require('../../shared/nutrition.js');
} catch (e) {
  fetch = require('node-fetch');
  SharedNutrition = require('../../shared/nutrition.js');
}

exports.handler = async (event, context) => {
  // 设置CORS头
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // 处理OPTIONS预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // 只允许POST请求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // 从环境变量获取API密钥
    const API_KEY = process.env.QWEN_API_KEY;
    console.log('API_KEY存在:', !!API_KEY);
    console.log('环境变量QWEN_API_KEY长度:', API_KEY ? API_KEY.length : 0);
    
    if (!API_KEY) {
      console.error('API密钥未配置，环境变量:', Object.keys(process.env).filter(k => k.includes('QWEN')));
      throw new Error('API密钥未配置');
    }

    const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    
    // 检查请求体大小
    const bodySize = event.body ? event.body.length : 0;
    console.log('请求体大小:', bodySize, 'bytes');
    
    if (bodySize > 5 * 1024 * 1024) { // 5MB限制
      throw new Error('请求体过大，请使用较小的图片');
    }
    
    // 解析请求体
    const requestData = JSON.parse(event.body);
    const { text, image, mode, prevJSON } = requestData;
    
    // 如果有图片，检查图片大小
    if (image) {
      const imageSize = image.length;
      console.log('图片数据大小:', imageSize, 'bytes');
      if (imageSize > 4 * 1024 * 1024) { // 4MB限制
        throw new Error('图片过大，请使用较小的图片（建议小于2MB）');
      }
    }

    console.log('收到AI调用请求:', { text: text?.substring(0, 100), hasImage: !!image, mode });

    // 额外AI提示（来自共享库）
    const extraHints = (SharedNutrition && SharedNutrition.AI_HINTS && SharedNutrition.AI_HINTS.proteinPowderRule)
      ? ('\n\n补充规则：' + SharedNutrition.AI_HINTS.proteinPowderRule)
      : '';

    // 系统提示词（根据模式变化，强化JSON、份量优先级、4/4/9一致性、过滤与合并）
    const SYS_HINT = (mode === 'goal')
      ? `你是一名营养目标规划助手。

请基于用户的身高/体重/体脂（可选）给出三套每日营养建议：增肌、维持、减脂。
只返回严格JSON：
{
  "presets": {
    "high":   { "cal": 0, "pro": 0, "fat": 0, "carbs": 0 },
    "normal": { "cal": 0, "pro": 0, "fat": 0, "carbs": 0 },
    "low":    { "cal": 0, "pro": 0, "fat": 0, "carbs": 0 }
  },
  "notes": "可选补充说明"
}
要求：数值为正数；若未给出carbs，请按 carbs = round((cal - pro*4 - fat*9)/4)。${extraHints}`
      : `你是一名营养分析助手。

任务A（识别）：从图片或文字识别所有食物，估算营养（kcal/蛋白/脂肪/碳水）。
- 份量优先级：先用文本/包装里的单位（g/ml/勺/份）；无明确份量时做常识估计，并在 notes 说明假设。
- 命名：使用通用中文菜名，不含品牌；必要时在名称末尾括注规格（如“牛奶(250ml)”）。
- 合并：同名/同类项合并为一项。
- 过滤：忽略纯水/气泡水/无糖黑咖啡/极少量调料等接近零热量项（除非用户明确要求统计）。
- 数量：最多返回 6 项。

任务B（修正）：根据用户指令对当前清单做最小变更
- "没有X/删除X" → 移除；"X改Y" → 替换；"多一份X/减少X" → 调份量；"只有X" → 仅保留X；其他口令按常理执行。

格式与数值：
- 仅返回严格JSON，无任何多余文字/代码块/注释：
{
  "items": [ {"name":"...","protein":0,"fat":0,"carbs":0,"kcal":0} ],
  "notes": "可选修正说明"
}
- 蛋白/脂肪/碳水一位小数；kcal为整数。
- 一致性：kcal 必须等于 round(4*protein + 4*carbs + 9*fat)。若不一致，以该公式重算后输出。
- 优先级：文字 > 包装文字 > 图像估计。
${extraHints}`;

    // 构建文本内容
    let textPrompt = '';
    if (mode === 'revise' && prevJSON) {
      textPrompt = `上一轮JSON：\n${JSON.stringify(prevJSON)}\n\n修正指令：${text}\n\n请返回新的严格JSON。`;
    } else {
      textPrompt = text || '请从图片识别食物并估算营养成分。';
    }

    // 根据是否有图片选择不同的消息格式
    let messages;
    
    if (image) {
      // 有图片时使用VL模型的复杂格式
      messages = [
        {
          role: 'system',
          content: [{ type: 'text', text: SYS_HINT }]
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: image }
            },
            {
              type: 'text',
              text: textPrompt
            }
          ]
        }
      ];
    } else {
      // 纯文字时使用简单格式
      messages = [
        {
          role: 'system',
          content: SYS_HINT
        },
        {
          role: 'user',
          content: textPrompt
        }
      ];
    }

    // 根据是否有图片/模式选择不同的模型
    const modelName = image ? 'qwen-vl-max' : 'qwen-plus';
    console.log('使用模型:', modelName);

    // 调用通义千问API，设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25秒超时
    
    let response;
    try {
      response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: messages,
          temperature: 0.2,
          max_tokens: 1000 // 限制响应长度
        }),
        signal: controller.signal
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('Fetch错误:', fetchError);
      
      if (fetchError.name === 'AbortError') {
        throw new Error('请求超时，请尝试使用较小的图片或稍后再试');
      }
      throw fetchError;
    }
      
    clearTimeout(timeoutId);

    console.log('通义千问API响应状态:', response.status);
    console.log('响应头:', JSON.stringify([...response.headers.entries()]));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('通义千问API错误详情:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText,
        headers: [...response.headers.entries()]
      });
      throw new Error(`API调用失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log('通义千问API返回数据:', data);

    if (data.error) {
      throw new Error(`API返回错误: ${data.error.message || data.error}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('API返回的内容为空');
    }

    // 解析JSON
    let result;
    try {
      // 尝试直接解析
      result = JSON.parse(content);
    } catch (e) {
      // 如果失败，尝试提取JSON块
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.error('JSON解析失败:', content);
          throw new Error('无法解析API返回的JSON格式');
        }
      } else {
        console.error('未找到JSON内容:', content);
        throw new Error('API返回内容不包含有效JSON');
      }
    }

    console.log('解析的JSON:', result);

    // 分模式返回
    if (mode === 'goal') {
      const src = result?.presets || {};
      const normalize = (g = {}) => {
        const cal = Math.max(0, Math.round(+g.cal || 0));
        const pro = Math.max(0, Math.round(+g.pro || 0));
        const fat = Math.max(0, Math.round(+g.fat || 0));
        let carbs = Math.max(0, Math.round(+g.carbs || 0));
        if (!carbs && cal && (pro || fat)) {
          carbs = Math.max(0, Math.round((cal - pro*4 - fat*9)/4));
        }
        return { cal, pro, fat, carbs };
      };
      const presets = {
        high: normalize(src.high || {}),
        normal: normalize(src.normal || {}),
        low: normalize(src.low || {})
      };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ presets, notes: typeof result.notes === 'string' ? result.notes : '' })
      };
    } else {
      // 识别/修正模式：规范化 items + totals
      const items = Array.isArray(result.items) ? result.items.map(it => {
        const p = +it.protein || 0;
        const c = +it.carbs || 0;
        const f = +it.fat || 0;
        const kcal = Number.isFinite(+it.kcal) ? Math.max(0, Math.round(+it.kcal)) : Math.round(p*4 + c*4 + f*9);
        return { 
          name: String(it.name || '食物'), 
          protein: +p.toFixed(1), 
          carbs: +c.toFixed(1), 
          fat: +f.toFixed(1), 
          kcal 
        };
      }) : [];

      const finalResult = { 
        items, 
        totals: (SharedNutrition && SharedNutrition.calcTotals) ? SharedNutrition.calcTotals(items) : (function(items){
          const t = items.reduce((a, i) => {
            const p = +i.protein || 0;
            const c = +i.carbs || 0;
            const f = +i.fat || 0;
            const k = Number.isFinite(+i.kcal) ? Math.max(0, Math.round(+i.kcal)) : Math.round(p*4 + c*4 + f*9);
            a.kcal += k; a.protein += p; a.carbs += c; a.fat += f; return a;
          }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
          t.protein = +t.protein.toFixed(1); t.carbs = +t.carbs.toFixed(1); t.fat = +t.fat.toFixed(1);
          return t;
        })(items), 
        notes: typeof result.notes === 'string' ? result.notes : '' 
      };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(finalResult)
      };
    }

  } catch (error) {
    console.error('函数执行错误:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message || '服务器内部错误' 
      })
    };
  }
};
