// netlify/functions/courses.js
// Netlify 无服务器函数 —— 飞书 Wiki 多维表格代理
// 访问地址：https://你的站点.netlify.app/.netlify/functions/courses

// ═══════════════════════════════════════════════════════
// 飞书表格配置 —— 改成你自己的值
// ═══════════════════════════════════════════════════════
const NODE_TOKEN = 'L1CwwU41bipe10kBCvPcIretnkd'; // 你知识库表格 URL 中 /wiki/ 后面那段
const TABLE_ID   = 'tblhUL770xpY9mCQ';            // URL 中 table= 后面那段

// ═══════════════════════════════════════════════════════
// 字段名映射 —— 改成和你飞书表格列名完全一致
// ═══════════════════════════════════════════════════════
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
};

export default async (req, context) => {
  const APP_ID     = Netlify.env.get('FEISHU_APP_ID');
  const APP_SECRET = Netlify.env.get('FEISHU_APP_SECRET');

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (!APP_ID || !APP_SECRET) {
    return new Response(
      JSON.stringify({ error: '缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET 环境变量', courses: [] }),
      { status: 500, headers }
    );
  }

  try {
    // 1) 获取 tenant_access_token
    const tokenRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.code !== 0) throw new Error('获取 token 失败：' + tokenData.msg);
    const token = tokenData.tenant_access_token;

    // 2) 用 node_token 换 app_token（知识库多维表格必需）
    const nodeRes = await fetch(
      `https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${NODE_TOKEN}&obj_type=wiki`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const nodeData = await nodeRes.json();
    if (nodeData.code !== 0) throw new Error('换 app_token 失败：' + nodeData.msg);
    const appToken = nodeData.data.node.obj_token;

    // 3) 读取多维表格记录（支持分页）
    const allItems = [];
    let pageToken = '';
    do {
      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${TABLE_ID}/records?page_size=500${pageToken ? '&page_token=' + pageToken : ''}`;
      const recRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const recData = await recRes.json();
      if (recData.code !== 0) throw new Error('读取记录失败：' + recData.msg);
      allItems.push(...(recData.data.items || []));
      pageToken = recData.data.page_token || '';
    } while (pageToken);

    // 4) 转换成前端需要的格式
    const courses = allItems
      .map((item, i) => {
        const f = item.fields || {};
        const get = (key) => {
          const v = f[FIELD_MAP[key]];
          if (v == null) return '';
          // 飞书文本字段返回 [{text: '...', type: 'text'}] 数组
          if (Array.isArray(v)) return v.map(x => x.text || x.name || x).join('');
          // 日期字段返回时间戳（毫秒）
          if (key === 'date' && typeof v === 'number') {
            const d = new Date(v);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          }
          // 单选字段返回 {text: '...'}
          if (typeof v === 'object' && v.text) return v.text;
          return String(v);
        };
        return {
          id: i + 1,
          country:  get('country'),
          city:     get('city'),
          category: get('category'),
          type:     get('type'),
          name:     get('name'),
          date:     get('date'),
          weekday:  get('weekday'),
          time:     get('time'),
          lang:     get('lang'),
          desc:     get('desc'),
          price:    get('price'),
          source:   get('source'),
          address:  get('address'),
        };
      })
      .filter(c => c.name && c.date);

    return new Response(
      JSON.stringify({ courses, count: courses.length, updated: new Date().toISOString() }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, courses: [] }),
      { status: 500, headers }
    );
  }
};

export const config = {
  path: '/api/courses',   // 这样前端就可以访问 /api/courses，比默认的 /.netlify/functions/courses 好看
};
