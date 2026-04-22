// netlify/functions/submit.js
// 接收网站投稿表单，写入飞书「待审核课程」表

const NODE_TOKEN       = 'L1CwwU41bipe10kBCvPcIretnkd';
const PENDING_TABLE_ID = 'tbl2hwZVWJ9vqiWE'; // 待审核课程表

// 字段名映射（代码字段 → 飞书列名，必须完全一致）
const FIELD_MAP = {
  country:  '国家',
  city:     '城市',
  category: '课程大类',
  type:     '课程类型',
  name:     '机构/课程名',
  date:     '上课日期',
  weekday:  '星期',
  time:     '时间段',
  lang:     '授课语言',
  desc:     '体验描述',
  price:    '参考价格',
  source:   '信息来源',
  address:  '地址',
  // 待审核表特有列
  submitted_at: '提交时间',
  contact:      '投稿人联系方式',
  status:       '审核状态',
};

export default async (req, context) => {
  const APP_ID     = Netlify.env.get('FEISHU_APP_ID');
  const APP_SECRET = Netlify.env.get('FEISHU_APP_SECRET');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };

  // CORS 预检
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  if (!APP_ID || !APP_SECRET) {
    return new Response(JSON.stringify({ error: '缺少环境变量' }), { status: 500, headers: corsHeaders });
  }

  try {
    // 读请求体
    const payload = await req.json();

    // 基本字段校验
    if (!payload.country || !payload.city || !payload.name || !payload.category || !payload.type || !payload.date) {
      return new Response(JSON.stringify({ error: '缺少必填字段' }), { status: 400, headers: corsHeaders });
    }

    // 1) 获取 token
    const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.code !== 0) throw new Error('获取 token 失败：' + tokenData.msg);
    const token = tokenData.tenant_access_token;

    // 2) 用 node_token 换 app_token
    const nodeRes = await fetch(
      `https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${NODE_TOKEN}&obj_type=wiki`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const nodeData = await nodeRes.json();
    if (nodeData.code !== 0) throw new Error('换 app_token 失败：' + nodeData.msg);
    const appToken = nodeData.data.node.obj_token;

    // 3) 构造 fields（飞书日期字段要时间戳毫秒）
    const fields = {};
    const put = (key, v) => { if (v !== undefined && v !== null && v !== '') fields[FIELD_MAP[key]] = v; };

    put('country',  payload.country);
    put('city',     payload.city);
    put('category', payload.category);
    put('type',     payload.type);
    put('name',     payload.name);

    // 日期转时间戳（毫秒）
    if (payload.date) {
      const ts = new Date(payload.date + 'T12:00:00').getTime();
      if (!isNaN(ts)) fields[FIELD_MAP.date] = ts;
    }

    put('weekday', payload.weekday);
    put('time',    payload.time);
    put('lang',    payload.lang);
    put('desc',    payload.desc);
    put('price',   payload.price);
    put('source',  payload.source);
    put('address', payload.address);
    put('contact', payload.contact);
    fields[FIELD_MAP.submitted_at] = Date.now();       // 提交时间，时间戳
    fields[FIELD_MAP.status]       = '待审核';          // 默认审核状态

    // 4) 写入记录
    const writeRes = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${PENDING_TABLE_ID}/records`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );
    const writeData = await writeRes.json();
    if (writeData.code !== 0) throw new Error('写入失败：' + writeData.msg);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
};

export const config = {
  path: '/api/submit',
};
